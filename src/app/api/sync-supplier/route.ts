import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase Client using the service role key to bypass RLS for the staging table
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Helper to look up keys in a case-insensitive, whitespace-insensitive way, supporting Vietnamese and English
function getField(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null

  // Create a mapping of lowercase, trimmed keys in the object
  const normalizedKeysMap: Record<string, string> = {}
  for (const k of Object.keys(obj)) {
    normalizedKeysMap[k.toLowerCase().trim()] = k
  }

  for (const requestedKey of keys) {
    const normReqKey = requestedKey.toLowerCase().trim()

    // Check if the normalized key exists in the object map
    if (normalizedKeysMap[normReqKey] !== undefined) {
      const originalKey = normalizedKeysMap[normReqKey]
      const value = obj[originalKey]
      if (value !== undefined && value !== null) {
        return String(value).trim()
      }
    }
  }

  return null
}

// Helper to parse Univer Workbook data structure into a flat array of key-value records
function parseUniverWorkbook(data: any): Record<string, string>[] {
  const records: Record<string, string>[] = []
  if (!data || typeof data !== 'object' || !data.sheets) return records

  for (const sheetId of Object.keys(data.sheets)) {
    const sheet = data.sheets[sheetId]
    const cellData = sheet.cellData
    if (!cellData || typeof cellData !== 'object') continue

    // Sort row keys numerically
    const rowKeys = Object.keys(cellData).sort(
      (a, b) => parseInt(a) - parseInt(b),
    )

    let headerRowIndex: string | null = null
    const headerMap: Record<string, string> = {} // maps column index -> header name (lowercase, trimmed)

    // 1. Find the header row
    for (const rKey of rowKeys) {
      const row = cellData[rKey]
      if (!row || typeof row !== 'object') continue

      let isHeaderCandidate = false
      const tempMap: Record<string, string> = {}

      for (const cKey of Object.keys(row)) {
        const cell: any = row[cKey]
        const val =
          cell && cell.v !== undefined && cell.v !== null
            ? String(cell.v).trim().toLowerCase()
            : ''
        if (val) {
          tempMap[cKey] = val
          // Identify as header if it contains key columns like 'công ty', 'tên', or 'mst'
          if (
            val.includes('công ty') ||
            val === 'tên' ||
            val === 'mst' ||
            val.includes('company') ||
            val.includes('name')
          ) {
            isHeaderCandidate = true
          }
        }
      }

      if (isHeaderCandidate) {
        headerRowIndex = rKey
        Object.assign(headerMap, tempMap)
        break
      }
    }

    if (headerRowIndex === null) continue

    // 2. Parse data rows succeeding the header row
    const startIdx = parseInt(headerRowIndex) + 1
    for (const rKey of rowKeys) {
      if (parseInt(rKey) < startIdx) continue
      const row = cellData[rKey]
      if (!row || typeof row !== 'object') continue

      const record: Record<string, string> = {}
      let hasData = false

      for (const cKey of Object.keys(row)) {
        const cell: any = row[cKey]
        const headerName = headerMap[cKey]
        if (headerName) {
          const val =
            cell && cell.v !== undefined && cell.v !== null
              ? String(cell.v).trim()
              : ''
          if (val) {
            record[headerName] = val
            hasData = true
          }
        }
      }

      if (hasData) {
        records.push(record)
      }
    }
  }

  return records
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify Secret Token
    const authHeader = req.headers.get('Authorization')
    const secretToken = process.env.SHEETS_SYNC_TOKEN

    if (!secretToken) {
      console.error('Server Configuration Error: SHEETS_SYNC_TOKEN is not set.')
      return NextResponse.json(
        { error: 'Internal Server Configuration Error' },
        { status: 500 },
      )
    }

    if (!authHeader || authHeader !== `Bearer ${secretToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing token' },
        { status: 401 },
      )
    }

    // 2. Parse payload
    const body = await req.json()

    // Check if the payload is a Supabase Webhook event
    let record: any = {}
    let isWebhook = false

    if (body && body.type && body.record && typeof body.record === 'object') {
      isWebhook = true
      // Only process INSERT and UPDATE events
      if (body.type !== 'INSERT' && body.type !== 'UPDATE') {
        return NextResponse.json({
          success: true,
          message: `Ignored ${body.type} event`,
        })
      }
      record = body.record
    } else {
      // Fallback: Direct API payload
      record = body
    }

    // 3. Process Univer Workbook format or fallback to flat JSON
    let rawSuppliersToInsert: any[] = []

    const isUniverWorkbook =
      record &&
      record.data &&
      typeof record.data === 'object' &&
      record.data.sheets !== undefined

    if (isUniverWorkbook) {
      // Parse the Univer workbook JSON data structure
      const parsedRows = parseUniverWorkbook(record.data)

      rawSuppliersToInsert = parsedRows
        .map((rowRecord) => {
          const companyName = getField(rowRecord, [
            'company',
            'company_name',
            'name',
            'Công ty',
            'công ty',
            'Company',
          ])
          const contactPerson = getField(rowRecord, [
            'contact_person',
            'contact',
            'primary_contact_name',
            'Tên',
            'tên',
            'Contact Person',
          ])
          const finalName = companyName || contactPerson || 'Unnamed Supplier'

          return {
            raw_name: finalName,
            raw_email: getField(rowRecord, ['email', 'Email']),
            raw_phone: getField(rowRecord, [
              'phone',
              'sdt',
              'Sdt',
              'Sđt',
              'Số điện thoại',
              'Phone',
            ]),
            raw_address: getField(rowRecord, [
              'address',
              'Địa chỉ',
              'địa chỉ',
              'Address',
            ]),
            raw_website: getField(rowRecord, ['website', 'Website']),
            raw_contact_person: contactPerson,
            raw_tax_id: getField(rowRecord, [
              'tax_id',
              'mst',
              'MST',
              'Mã số thuế',
            ]),
            raw_established_date: getField(rowRecord, [
              'established_date',
              'founded_date',
              'Ngày hoạt động công ty',
              'ngày hoạt động',
              'Established Date',
            ]),
            raw_payment_terms: getField(rowRecord, [
              'payment_terms',
              'Điều kiện thanh toán',
              'điều kiện thanh toán',
              'Payment Terms',
            ]),
            raw_factory_area: getField(rowRecord, [
              'factory_area',
              'Diện tích nhà xưởng',
              'diện tích',
              'Factory Area',
            ]),
            raw_total_staff: getField(rowRecord, [
              'total_staff',
              'company_size',
              'Tổng lực lượng con người',
              'nhân sự',
              'Total Staff',
            ]),
            raw_workers: getField(rowRecord, [
              'workers',
              'Nhân công lao động',
              'nhân công',
              'Workers',
            ]),
            raw_capacity: getField(rowRecord, [
              'capacity',
              'production_capacity',
              'Năng lực sản xuất/ tháng',
              'năng lực sản xuất',
              'Capacity',
            ]),
            raw_main_product: getField(rowRecord, [
              'main_product',
              'Chủ lực dòng hàng',
              'dòng hàng',
              'Main Product',
            ]),
            raw_main_wood: getField(rowRecord, [
              'main_wood',
              'Gỗ chủ lực làm',
              'gỗ chủ lực',
              'Wood',
            ]),
            raw_notes: getField(rowRecord, [
              'notes',
              'Ghi chú',
              'ghi chú',
              'Notes',
            ]),
            raw_user_id: record.user_id || null,
            status: 'pending',
          }
        })
        .filter((r) => r.raw_name !== 'Unnamed Supplier')
    } else {
      // Flat payload format
      const companyName = getField(record, [
        'company',
        'company_name',
        'name',
        'Công ty',
        'công ty',
        'Company',
      ])
      const contactPerson = getField(record, [
        'contact_person',
        'contact',
        'primary_contact_name',
        'Tên',
        'tên',
        'Contact Person',
      ])
      const finalName = companyName || contactPerson

      if (finalName) {
        rawSuppliersToInsert.push({
          raw_name: finalName,
          raw_email: getField(record, ['email', 'Email']),
          raw_phone: getField(record, [
            'phone',
            'sdt',
            'Sdt',
            'Sđt',
            'Số điện thoại',
            'Phone',
          ]),
          raw_address: getField(record, [
            'address',
            'Địa chỉ',
            'địa chỉ',
            'Address',
          ]),
          raw_website: getField(record, ['website', 'Website']),
          raw_contact_person: contactPerson,
          raw_tax_id: getField(record, ['tax_id', 'mst', 'MST', 'Mã số thuế']),
          raw_established_date: getField(record, [
            'established_date',
            'founded_date',
            'Ngày hoạt động công ty',
            'ngày hoạt động',
            'Established Date',
          ]),
          raw_payment_terms: getField(record, [
            'payment_terms',
            'Điều kiện thanh toán',
            'điều kiện thanh toán',
            'Payment Terms',
          ]),
          raw_factory_area: getField(record, [
            'factory_area',
            'Diện tích nhà xưởng',
            'diện tích',
            'Factory Area',
          ]),
          raw_total_staff: getField(record, [
            'total_staff',
            'company_size',
            'Tổng lực lượng con người',
            'nhân sự',
            'Total Staff',
          ]),
          raw_workers: getField(record, [
            'workers',
            'Nhân công lao động',
            'nhân công',
            'Workers',
          ]),
          raw_capacity: getField(record, [
            'capacity',
            'production_capacity',
            'Năng lực sản xuất/ tháng',
            'năng lực sản xuất',
            'Capacity',
          ]),
          raw_main_product: getField(record, [
            'main_product',
            'Chủ lực dòng hàng',
            'dòng hàng',
            'Main Product',
          ]),
          raw_main_wood: getField(record, [
            'main_wood',
            'Gỗ chủ lực làm',
            'gỗ chủ lực',
            'Wood',
          ]),
          raw_notes: getField(record, ['notes', 'Ghi chú', 'ghi chú', 'Notes']),
          raw_user_id: record.user_id || null,
          status: 'pending',
        })
      }
    }

    if (rawSuppliersToInsert.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No valid supplier records found to sync' },
        { status: 200 },
      )
    }

    // 4. Insert into raw staging table (bulk insert)
    const { data, error } = await supabase
      .from('sheets_raw_suppliers')
      .insert(rawSuppliersToInsert)
      .select()

    if (error) {
      console.error('Failed to insert into raw staging table:', error.message)
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: `Successfully synchronized ${rawSuppliersToInsert.length} supplier record(s) to staging table`,
        stagingRecordsCount: rawSuppliersToInsert.length,
      },
      { status: 200 },
    )
  } catch (err: any) {
    console.error('Unexpected error in sync-supplier endpoint:', err)
    return NextResponse.json(
      { error: err.message || 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
