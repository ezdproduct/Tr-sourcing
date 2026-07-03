'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  X, Phone, Mail, MapPin, Globe, ArrowUpRight, ArrowLeft, Edit, Trash2, Plus, Loader2, Check, CheckCircle2, AlertCircle, Calendar, Shield,
  Upload, FileText, File, Copy, ExternalLink, TrendingUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { 
  addSupplierCapabilityAction, 
  updateSupplierCapabilityAction, 
  deleteSupplierCapabilityAction 
} from '../../actions'
import { updateSupplierProfileAction } from '../../../sourcing/actions'
import { HistoryChartsModal } from './history-charts-modal'

// Helper to upload a file to Cloudflare R2 via proxy API
async function uploadFile(file: File, supplierId?: string, customName?: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  if (supplierId) {
    formData.append('supplierId', supplierId)
  }
  if (customName) {
    formData.append('customName', customName)
  }
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const errorData = await res.json()
    throw new Error(errorData.error || 'Failed to upload file to R2.')
  }
  const data = await res.json()
  return data.url
}

let toastIdCounter = 0

interface SupplierDetailClientProps {
  supplier: any
}

export function SupplierDetailClient({ supplier }: SupplierDetailClientProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'sourcing' | 'financials' | 'documents' | 'product' | 'library' | 'logs'>('overview')
  const [isEditMode, setIsEditMode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Product/Capability States
  const [capabilities, setCapabilities] = useState<any[]>(supplier.supplier_capabilities || [])
  const [isAddProductOpen, setIsAddProductOpen] = useState(false)
  const [isEditProductOpen, setIsEditProductOpen] = useState(false)
  const [editingCapability, setEditingCapability] = useState<any | null>(null)
  const [selectedHistoryProduct, setSelectedHistoryProduct] = useState<string | null>(null)
  
  const [productName, setProductName] = useState('')
  const [defaultPrice, setDefaultPrice] = useState('')
  const [leadTime, setLeadTime] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productMoq, setProductMoq] = useState('')
  const [productSku, setProductSku] = useState('')
  const [productMonthlyCapacity, setProductMonthlyCapacity] = useState('')
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isDeletingProduct, setIsDeletingProduct] = useState<string | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [deleteConfirmProduct, setDeleteConfirmProduct] = useState<any | null>(null)

  // Library States & Helpers
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'profile' | 'catalog' | 'contract' | 'nda' | 'certificate' | 'audit' | 'sample' | 'images'>('all')
  const [selectedUploadCategory, setSelectedUploadCategory] = useState<'profile' | 'catalog' | 'contract' | 'nda' | 'certificate' | 'audit' | 'sample'>('certificate')
  const [isUploadingLibrary, setIsUploadingLibrary] = useState(false)
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [deleteConfirmFile, setDeleteConfirmFile] = useState<any | null>(null)
  const [librarySelectedFiles, setLibrarySelectedFiles] = useState<File[]>([])
  const [fileCustomNames, setFileCustomNames] = useState<Record<number, string>>({})
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type?: 'success' | 'error' }>>([])

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = String(++toastIdCounter)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4500)
  }

  const getCleanFileName = (url: string, defaultName: string) => {
    try {
      let filename = ''
      if (url.startsWith('/api/images')) {
        const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
        const key = u.searchParams.get('key')
        if (key) {
          filename = key.substring(key.lastIndexOf('/') + 1)
        }
      } else {
        const u = new URL(url)
        filename = u.pathname.substring(u.pathname.lastIndexOf('/') + 1)
      }
      if (filename) {
        // Remove R2 prefix: e.g. 1782723010471-oc7k40p93h1-filename.pdf
        let cleanName = filename.replace(/^\d+-[a-z0-9]+-/, '')
        // Remove UUIDs
        cleanName = cleanName.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '')
        // Remove 13 digit timestamps
        cleanName = cleanName.replace(/\d{13}/g, '')
        // Clean redundant dashes and underscores
        cleanName = cleanName.replace(/[-_]{2,}/g, '-')
        cleanName = cleanName.replace(/^[-_]+|[-_]+(?=\.[a-zA-Z0-9]+$)/g, '')
        return decodeURIComponent(cleanName)
      }
    } catch (e) {
      // fallback
    }
    return defaultName
  }

  const getLibraryFiles = () => {
    const files: Array<{
      id: string
      name: string
      url: string
      category: 'profile' | 'catalog' | 'contract' | 'nda' | 'certificate' | 'audit' | 'sample'
      fieldName: 'docCompanyProfile' | 'docCatalog' | 'docContract' | 'docNda' | 'docCertificates' | 'docAuditReports' | 'docSampleApprovals'
      isMultiple: boolean
    }> = []

    if (profileForm.docCompanyProfile) {
      files.push({
        id: 'docCompanyProfile',
        name: getCleanFileName(profileForm.docCompanyProfile, 'Company Profile'),
        url: profileForm.docCompanyProfile,
        category: 'profile',
        fieldName: 'docCompanyProfile',
        isMultiple: false
      })
    }
    if (profileForm.docCatalog) {
      files.push({
        id: 'docCatalog',
        name: getCleanFileName(profileForm.docCatalog, 'Product Catalog'),
        url: profileForm.docCatalog,
        category: 'catalog',
        fieldName: 'docCatalog',
        isMultiple: false
      })
    }
    if (profileForm.docContract) {
      files.push({
        id: 'docContract',
        name: getCleanFileName(profileForm.docContract, 'Purchase Contract'),
        url: profileForm.docContract,
        category: 'contract',
        fieldName: 'docContract',
        isMultiple: false
      })
    }
    if (profileForm.docNda) {
      files.push({
        id: 'docNda',
        name: getCleanFileName(profileForm.docNda, 'NDA Agreement'),
        url: profileForm.docNda,
        category: 'nda',
        fieldName: 'docNda',
        isMultiple: false
      })
    }

    const parseMulti = (val: string, category: any, fieldName: any) => {
      if (!val) return
      const urls = val.split(',').map(s => s.trim()).filter(Boolean)
      urls.forEach((url, idx) => {
        const defaultName = `${category.charAt(0).toUpperCase() + category.slice(1)} ${idx + 1}`
        files.push({
          id: `${fieldName}-${idx}`,
          name: getCleanFileName(url, defaultName),
          url,
          category,
          fieldName,
          isMultiple: true
        })
      })
    }

    parseMulti(profileForm.docCertificates, 'certificate', 'docCertificates')
    parseMulti(profileForm.docAuditReports, 'audit', 'docAuditReports')
    parseMulti(profileForm.docSampleApprovals, 'sample', 'docSampleApprovals')

    return files
  }

  const handleDeleteLibraryFile = (file: any) => {
    setDeleteConfirmFile(file)
  }

  const confirmDeleteLibraryFile = async () => {
    if (!deleteConfirmFile) return
    const file = deleteConfirmFile
    setDeleteConfirmFile(null)

    setIsSaving(true)
    const updatedForm: any = { ...profileForm }

    if (!file.isMultiple) {
      updatedForm[file.fieldName] = ''
    } else {
      const urls = (profileForm as any)[file.fieldName]
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const remaining = urls.filter((u: string) => u !== file.url)
      updatedForm[file.fieldName] = remaining.join(', ')
    }

    setProfileForm(updatedForm)

    const res = await updateSupplierProfileAction({
      supplierId: supplier.id,
      email: updatedForm.email.trim(),
      phone: updatedForm.phone.trim(),
      address: updatedForm.address.trim(),
      website: updatedForm.website.trim(),
      contactPerson: updatedForm.contactPerson.trim(),
      taxId: updatedForm.taxId.trim(),
      businessType: updatedForm.businessType.trim(),
      capabilities: capabilities.map((cap: any) => ({
        productName: cap.product_name || cap.productName || '',
        targetPrice: Number(cap.target_price || cap.targetPrice || 0)
      })),

      supplierCode: updatedForm.supplierCode.trim() || undefined,
      legalName: updatedForm.legalName.trim(),
      yearFounded: updatedForm.yearFounded ? parseInt(updatedForm.yearFounded) : undefined,
      companySize: updatedForm.companySize.trim(),
      industry: updatedForm.industry.trim(),
      mainProducts: updatedForm.mainProducts ? updatedForm.mainProducts.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      shortDescription: updatedForm.shortDescription.trim(),

      primaryContactName: updatedForm.primaryContactName.trim(),
      position: updatedForm.position.trim(),
      alternativeContact: updatedForm.alternativeContact.trim(),
      street: updatedForm.street.trim(),
      district: updatedForm.district.trim(),
      city: updatedForm.city.trim(),
      country: updatedForm.country.trim(),
      postalCode: updatedForm.postalCode.trim(),
      linkedin: updatedForm.linkedin.trim(),
      socialContact: updatedForm.socialContact.trim(),

      paymentTerms: updatedForm.paymentTerms.trim(),
      currency: updatedForm.currency.trim(),
      bankInfo: updatedForm.bankInfo.trim(),
      creditLimit: updatedForm.creditLimit ? parseFloat(updatedForm.creditLimit) : undefined,
      taxStatus: updatedForm.taxStatus.trim(),
      businessLicense: updatedForm.businessLicense.trim(),
      certifications: updatedForm.certifications ? updatedForm.certifications.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

      sourcingCategory: updatedForm.sourcingCategory.trim(),
      leadTimeAverage: updatedForm.leadTimeAverage ? parseInt(updatedForm.leadTimeAverage) : undefined,
      moq: updatedForm.moq ? parseInt(updatedForm.moq) : undefined,
      pricingTier: updatedForm.pricingTier.trim(),
      qualityRating: updatedForm.qualityRating.trim(),
      reliabilityScore: updatedForm.reliabilityScore ? parseFloat(updatedForm.reliabilityScore) : undefined,
      onTimeDeliveryRate: updatedForm.onTimeDeliveryRate ? parseFloat(updatedForm.onTimeDeliveryRate) : undefined,
      defectRate: updatedForm.defectRate ? parseFloat(updatedForm.defectRate) : undefined,
      lastSourcedDate: updatedForm.lastSourcedDate || undefined,
      totalSpend: updatedForm.totalSpend ? parseFloat(updatedForm.totalSpend) : undefined,
      totalOrders: updatedForm.totalOrders ? parseInt(updatedForm.totalOrders) : undefined,
      isPreferred: updatedForm.isPreferred,

      status: updatedForm.status,
      sourcingStage: updatedForm.sourcingStage,
      approvalDate: updatedForm.approvalDate || undefined,
      reviewedBy: updatedForm.reviewedBy.trim(),
      nextReviewDate: updatedForm.nextReviewDate || undefined,
      riskLevel: updatedForm.riskLevel,
      riskNotes: updatedForm.riskNotes.trim(),
      createdBy: updatedForm.createdBy.trim(),
      ownerPic: updatedForm.ownerPic.trim(),
      tags: updatedForm.tags ? updatedForm.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

      docCompanyProfile: updatedForm.docCompanyProfile.trim(),
      docCatalog: updatedForm.docCatalog.trim(),
      docContract: updatedForm.docContract.trim(),
      docCertificates: updatedForm.docCertificates ? updatedForm.docCertificates.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      docAuditReports: updatedForm.docAuditReports ? updatedForm.docAuditReports.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      docSampleApprovals: updatedForm.docSampleApprovals ? updatedForm.docSampleApprovals.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      docNda: updatedForm.docNda.trim(),

      esgScore: updatedForm.esgScore ? parseFloat(updatedForm.esgScore) : undefined,
      socialResponsibilityNotes: updatedForm.socialResponsibilityNotes.trim(),
      maxCapacityMonthly: updatedForm.maxCapacityMonthly.trim(),
      mainMarkets: updatedForm.mainMarkets ? updatedForm.mainMarkets.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      competitors: updatedForm.competitors.trim(),
      notes: updatedForm.notes.trim(),
      communicationHistory: updatedForm.communicationHistory.trim()
    })

    setIsSaving(false)
    if (!res.success) {
      triggerToast(`Failed to delete file: ${res.error}`, 'error')
    } else {
      triggerToast('File removed successfully!')
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setIsUploadingLogo(true)
      try {
        const url = await uploadFile(file, supplier.id, 'supplier_logo')
        
        // Update local form state
        setProfileForm(prev => ({ ...prev, logoUrl: url }))
        
        // Update immediately in the database
        const res = await updateSupplierProfileAction({
          supplierId: supplier.id,
          email: profileForm.email.trim(),
          phone: profileForm.phone.trim(),
          address: profileForm.address.trim(),
          website: profileForm.website.trim(),
          contactPerson: profileForm.contactPerson.trim(),
          taxId: profileForm.taxId.trim(),
          businessType: profileForm.businessType.trim(),
          logoUrl: url,
          capabilities: capabilities.map((cap: any) => ({
            productName: cap.product_name || '',
            targetPrice: Number(cap.target_price || 0)
          })),

          supplierCode: profileForm.supplierCode.trim() || undefined,
          legalName: profileForm.legalName.trim(),
          yearFounded: profileForm.yearFounded ? parseInt(profileForm.yearFounded) : undefined,
          companySize: profileForm.companySize.trim(),
          industry: profileForm.industry.trim(),
          mainProducts: profileForm.mainProducts ? profileForm.mainProducts.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          shortDescription: profileForm.shortDescription.trim(),

          primaryContactName: profileForm.primaryContactName.trim(),
          position: profileForm.position.trim(),
          alternativeContact: profileForm.alternativeContact.trim(),
          street: profileForm.street.trim(),
          district: profileForm.district.trim(),
          city: profileForm.city.trim(),
          country: profileForm.country.trim(),
          postalCode: profileForm.postalCode.trim(),
          linkedin: profileForm.linkedin.trim(),
          socialContact: profileForm.socialContact.trim(),

          paymentTerms: profileForm.paymentTerms.trim(),
          currency: profileForm.currency.trim(),
          bankInfo: profileForm.bankInfo.trim(),
          creditLimit: profileForm.creditLimit ? parseFloat(profileForm.creditLimit) : undefined,
          taxStatus: profileForm.taxStatus.trim(),
          businessLicense: profileForm.businessLicense.trim(),
          certifications: profileForm.certifications ? profileForm.certifications.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

          sourcingCategory: profileForm.sourcingCategory.trim(),
          leadTimeAverage: profileForm.leadTimeAverage ? parseInt(profileForm.leadTimeAverage) : undefined,
          moq: profileForm.moq ? parseInt(profileForm.moq) : undefined,
          pricingTier: profileForm.pricingTier.trim(),
          qualityRating: profileForm.qualityRating.trim(),
          reliabilityScore: profileForm.reliabilityScore ? parseFloat(profileForm.reliabilityScore) : undefined,
          onTimeDeliveryRate: profileForm.onTimeDeliveryRate ? parseFloat(profileForm.onTimeDeliveryRate) : undefined,
          defectRate: profileForm.defectRate ? parseFloat(profileForm.defectRate) : undefined,
          lastSourcedDate: profileForm.lastSourcedDate || undefined,
          totalSpend: profileForm.totalSpend ? parseFloat(profileForm.totalSpend) : undefined,
          totalOrders: profileForm.totalOrders ? parseInt(profileForm.totalOrders) : undefined,
          isPreferred: profileForm.isPreferred,

          status: profileForm.status,
          sourcingStage: profileForm.sourcingStage,
          approvalDate: profileForm.approvalDate || undefined,
          reviewedBy: profileForm.reviewedBy.trim(),
          nextReviewDate: profileForm.nextReviewDate || undefined,
          riskLevel: profileForm.riskLevel,
          riskNotes: profileForm.riskNotes.trim(),
          createdBy: profileForm.createdBy.trim(),
          ownerPic: profileForm.ownerPic.trim(),
          tags: profileForm.tags ? profileForm.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

          docCompanyProfile: profileForm.docCompanyProfile.trim(),
          docCatalog: profileForm.docCatalog.trim(),
          docContract: profileForm.docContract.trim(),
          docCertificates: profileForm.docCertificates ? profileForm.docCertificates.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          docAuditReports: profileForm.docAuditReports ? profileForm.docAuditReports.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          docSampleApprovals: profileForm.docSampleApprovals ? profileForm.docSampleApprovals.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          docNda: profileForm.docNda.trim(),

          esgScore: profileForm.esgScore ? parseFloat(profileForm.esgScore) : undefined,
          socialResponsibilityNotes: profileForm.socialResponsibilityNotes.trim(),
          maxCapacityMonthly: profileForm.maxCapacityMonthly.trim(),
          mainMarkets: profileForm.mainMarkets ? profileForm.mainMarkets.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
          competitors: profileForm.competitors.trim(),
          notes: profileForm.notes.trim(),
          communicationHistory: profileForm.communicationHistory.trim()
        })
        if (res.success) {
          triggerToast('Logo updated successfully!')
        } else {
          triggerToast(`Failed to save logo in database: ${res.error}`, 'error')
        }
      } catch (err: any) {
        triggerToast(`Logo upload failed: ${err.message || err}`, 'error')
      } finally {
        setIsUploadingLogo(false)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files)
      setLibrarySelectedFiles(prev => [...prev, ...filesArray])
    }
  }

  const removeSelectedFile = (index: number) => {
    setLibrarySelectedFiles(prev => prev.filter((_, idx) => idx !== index))
  }

  const handleLibraryBatchUpload = async () => {
    if (librarySelectedFiles.length === 0) {
      triggerToast('Please select at least one file to upload.', 'error')
      return
    }

    setIsUploadingLibrary(true)
    setErrorMessage(null)

    try {
      let fieldName: 'docCompanyProfile' | 'docCatalog' | 'docContract' | 'docNda' | 'docCertificates' | 'docAuditReports' | 'docSampleApprovals'
      let isMultiple = false

      switch (selectedUploadCategory) {
        case 'profile':
          fieldName = 'docCompanyProfile'
          break
        case 'catalog':
          fieldName = 'docCatalog'
          break
        case 'contract':
          fieldName = 'docContract'
          break
        case 'nda':
          fieldName = 'docNda'
          break
        case 'certificate':
          fieldName = 'docCertificates'
          isMultiple = true
          break
        case 'audit':
          fieldName = 'docAuditReports'
          isMultiple = true
          break
        case 'sample':
          fieldName = 'docSampleApprovals'
          isMultiple = true
          break
        default:
          throw new Error('Invalid category selected')
      }

      if (!isMultiple && librarySelectedFiles.length > 1) {
        throw new Error(`The category "${selectedUploadCategory}" only accepts a single file. Please select only one file or choose a different category.`)
      }

      const uploadedUrls = await Promise.all(
        librarySelectedFiles.map((file, idx) => {
          const customName = fileCustomNames[idx]?.trim() || ''
          return uploadFile(file, supplier.id, customName || undefined)
        })
      )

      const updatedForm: any = { ...profileForm }
      if (!isMultiple) {
        updatedForm[fieldName] = uploadedUrls[0]
      } else {
        const existing = (profileForm as any)[fieldName] ? (profileForm as any)[fieldName].split(',').map((s: string) => s.trim()).filter(Boolean) : []
        existing.push(...uploadedUrls)
        updatedForm[fieldName] = existing.join(', ')
      }

      setProfileForm(updatedForm)

      const res = await updateSupplierProfileAction({
        supplierId: supplier.id,
        email: updatedForm.email.trim(),
        phone: updatedForm.phone.trim(),
        address: updatedForm.address.trim(),
        website: updatedForm.website.trim(),
        contactPerson: updatedForm.contactPerson.trim(),
        taxId: updatedForm.taxId.trim(),
        businessType: updatedForm.businessType.trim(),
        capabilities: capabilities.map((cap: any) => ({
          productName: cap.product_name || cap.productName || '',
          targetPrice: Number(cap.target_price || cap.targetPrice || 0)
        })),

        supplierCode: updatedForm.supplierCode.trim() || undefined,
        legalName: updatedForm.legalName.trim(),
        yearFounded: updatedForm.yearFounded ? parseInt(updatedForm.yearFounded) : undefined,
        companySize: updatedForm.companySize.trim(),
        industry: updatedForm.industry.trim(),
        mainProducts: updatedForm.mainProducts ? updatedForm.mainProducts.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        shortDescription: updatedForm.shortDescription.trim(),

        primaryContactName: updatedForm.primaryContactName.trim(),
        position: updatedForm.position.trim(),
        alternativeContact: updatedForm.alternativeContact.trim(),
        street: updatedForm.street.trim(),
        district: updatedForm.district.trim(),
        city: updatedForm.city.trim(),
        country: updatedForm.country.trim(),
        postalCode: updatedForm.postalCode.trim(),
        linkedin: updatedForm.linkedin.trim(),
        socialContact: updatedForm.socialContact.trim(),

        paymentTerms: updatedForm.paymentTerms.trim(),
        currency: updatedForm.currency.trim(),
        bankInfo: updatedForm.bankInfo.trim(),
        creditLimit: updatedForm.creditLimit ? parseFloat(updatedForm.creditLimit) : undefined,
        taxStatus: updatedForm.taxStatus.trim(),
        businessLicense: updatedForm.businessLicense.trim(),
        certifications: updatedForm.certifications ? updatedForm.certifications.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

        sourcingCategory: updatedForm.sourcingCategory.trim(),
        leadTimeAverage: updatedForm.leadTimeAverage ? parseInt(updatedForm.leadTimeAverage) : undefined,
        moq: updatedForm.moq ? parseInt(updatedForm.moq) : undefined,
        pricingTier: updatedForm.pricingTier.trim(),
        qualityRating: updatedForm.qualityRating.trim(),
        reliabilityScore: updatedForm.reliabilityScore ? parseFloat(updatedForm.reliabilityScore) : undefined,
        onTimeDeliveryRate: updatedForm.onTimeDeliveryRate ? parseFloat(updatedForm.onTimeDeliveryRate) : undefined,
        defectRate: updatedForm.defectRate ? parseFloat(updatedForm.defectRate) : undefined,
        lastSourcedDate: updatedForm.lastSourcedDate || undefined,
        totalSpend: updatedForm.totalSpend ? parseFloat(updatedForm.totalSpend) : undefined,
        totalOrders: updatedForm.totalOrders ? parseInt(updatedForm.totalOrders) : undefined,
        isPreferred: updatedForm.isPreferred,

        status: updatedForm.status,
        sourcingStage: updatedForm.sourcingStage,
        approvalDate: updatedForm.approvalDate || undefined,
        reviewedBy: updatedForm.reviewedBy.trim(),
        nextReviewDate: updatedForm.nextReviewDate || undefined,
        riskLevel: updatedForm.riskLevel,
        riskNotes: updatedForm.riskNotes.trim(),
        createdBy: updatedForm.createdBy.trim(),
        ownerPic: updatedForm.ownerPic.trim(),
        tags: updatedForm.tags ? updatedForm.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

        docCompanyProfile: updatedForm.docCompanyProfile.trim(),
        docCatalog: updatedForm.docCatalog.trim(),
        docContract: updatedForm.docContract.trim(),
        docCertificates: updatedForm.docCertificates ? updatedForm.docCertificates.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        docAuditReports: updatedForm.docAuditReports ? updatedForm.docAuditReports.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        docSampleApprovals: updatedForm.docSampleApprovals ? updatedForm.docSampleApprovals.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        docNda: updatedForm.docNda.trim(),

        esgScore: updatedForm.esgScore ? parseFloat(updatedForm.esgScore) : undefined,
        socialResponsibilityNotes: updatedForm.socialResponsibilityNotes.trim(),
        maxCapacityMonthly: updatedForm.maxCapacityMonthly.trim(),
        mainMarkets: updatedForm.mainMarkets ? updatedForm.mainMarkets.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        competitors: updatedForm.competitors.trim(),
        notes: updatedForm.notes.trim(),
        communicationHistory: updatedForm.communicationHistory.trim()
      })

      if (!res.success) {
        throw new Error(res.error)
      }

      triggerToast('All files uploaded and linked successfully!')
      setLibrarySelectedFiles([])
      setFileCustomNames({})
      setIsUploadModalOpen(false)
    } catch (err: any) {
      triggerToast(`Upload failed: ${err.message || err}`, 'error')
    } finally {
      setIsUploadingLibrary(false)
    }
  }

  // 60+ fields profile form state
  const sDetails = supplier || {}
  const [profileForm, setProfileForm] = useState({
    name: supplier.name || '',
    email: supplier.email || '',
    phone: supplier.phone || '',
    address: supplier.address || '',
    website: supplier.website || '',
    contactPerson: supplier.contact_person || '',
    taxId: supplier.tax_id || '',
    businessType: supplier.business_type || '',
    logoUrl: sDetails.logo_url || '',

    // Basic Information
    supplierCode: sDetails.supplier_code || '',
    legalName: sDetails.legal_name || '',
    yearFounded: sDetails.year_founded ? String(sDetails.year_founded) : '',
    companySize: sDetails.company_size || '',
    industry: sDetails.industry || '',
    mainProducts: sDetails.main_products ? sDetails.main_products.join(', ') : '',
    shortDescription: sDetails.short_description || '',

    // Contact Information
    primaryContactName: sDetails.primary_contact_name || '',
    position: sDetails.position || '',
    alternativeContact: sDetails.alternative_contact || '',
    street: sDetails.street || '',
    district: sDetails.district || '',
    city: sDetails.city || '',
    country: sDetails.country || '',
    postalCode: sDetails.postal_code || '',
    linkedin: sDetails.linkedin || '',
    socialContact: sDetails.social_contact || '',

    // Financials & Systems
    paymentTerms: sDetails.payment_terms || '',
    currency: sDetails.currency || 'USD',
    bankInfo: sDetails.bank_info || '',
    creditLimit: sDetails.credit_limit ? String(sDetails.credit_limit) : '',
    taxStatus: sDetails.tax_status || '',
    businessLicense: sDetails.business_license || '',
    certifications: sDetails.certifications ? sDetails.certifications.join(', ') : '',

    // Sourcing & Performance
    sourcingCategory: sDetails.sourcing_category || '',
    leadTimeAverage: sDetails.lead_time_average ? String(sDetails.lead_time_average) : '',
    moq: sDetails.moq ? String(sDetails.moq) : '',
    pricingTier: sDetails.pricing_tier || '',
    qualityRating: sDetails.quality_rating || '',
    reliabilityScore: sDetails.reliability_score ? String(sDetails.reliability_score) : '',
    onTimeDeliveryRate: sDetails.on_time_delivery_rate ? String(sDetails.on_time_delivery_rate) : '',
    defectRate: sDetails.defect_rate ? String(sDetails.defect_rate) : '',
    lastSourcedDate: sDetails.last_sourced_date || '',
    totalSpend: sDetails.total_spend ? String(sDetails.total_spend) : '',
    totalOrders: sDetails.total_orders ? String(sDetails.total_orders) : '',
    isPreferred: sDetails.is_preferred || false,

    // Metadata & Tracking
    status: sDetails.status || 'Prospect',
    sourcingStage: sDetails.sourcing_stage || 'New',
    approvalDate: sDetails.approval_date || '',
    reviewedBy: sDetails.reviewed_by || '',
    nextReviewDate: sDetails.next_review_date || '',
    riskLevel: sDetails.risk_level || '',
    riskNotes: sDetails.risk_notes || '',
    createdBy: sDetails.created_by || '',
    ownerPic: sDetails.owner_pic || '',
    tags: sDetails.tags ? sDetails.tags.join(', ') : '',

    // Attachments
    docCompanyProfile: sDetails.doc_company_profile || '',
    docCatalog: sDetails.doc_catalog || '',
    docContract: sDetails.doc_contract || '',
    docCertificates: sDetails.doc_certificates ? sDetails.doc_certificates.join(', ') : '',
    docAuditReports: sDetails.doc_audit_reports ? sDetails.doc_audit_reports.join(', ') : '',
    docSampleApprovals: sDetails.doc_sample_approvals ? sDetails.doc_sample_approvals.join(', ') : '',
    docNda: sDetails.doc_nda || '',

    // Advanced
    esgScore: sDetails.esg_score ? String(sDetails.esg_score) : '',
    socialResponsibilityNotes: sDetails.social_responsibility_notes || '',
    maxCapacityMonthly: sDetails.max_capacity_monthly || '',
    mainMarkets: sDetails.main_markets ? sDetails.main_markets.join(', ') : '',
    competitors: sDetails.competitors || '',
    notes: sDetails.notes || '',
    communicationHistory: sDetails.communication_history || ''
  })

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrorMessage(null)

    const res = await updateSupplierProfileAction({
      supplierId: supplier.id,
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim(),
      address: profileForm.address.trim(),
      website: profileForm.website.trim(),
      contactPerson: profileForm.contactPerson.trim(),
      taxId: profileForm.taxId.trim(),
      businessType: profileForm.businessType.trim(),
      logoUrl: profileForm.logoUrl.trim(),
      capabilities: capabilities.map((cap: any) => ({
        productName: cap.product_name || '',
        targetPrice: Number(cap.target_price || 0)
      })),

      supplierCode: profileForm.supplierCode.trim() || undefined,
      legalName: profileForm.legalName.trim(),
      yearFounded: profileForm.yearFounded ? parseInt(profileForm.yearFounded) : undefined,
      companySize: profileForm.companySize.trim(),
      industry: profileForm.industry.trim(),
      mainProducts: profileForm.mainProducts ? profileForm.mainProducts.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      shortDescription: profileForm.shortDescription.trim(),

      primaryContactName: profileForm.primaryContactName.trim(),
      position: profileForm.position.trim(),
      alternativeContact: profileForm.alternativeContact.trim(),
      street: profileForm.street.trim(),
      district: profileForm.district.trim(),
      city: profileForm.city.trim(),
      country: profileForm.country.trim(),
      postalCode: profileForm.postalCode.trim(),
      linkedin: profileForm.linkedin.trim(),
      socialContact: profileForm.socialContact.trim(),

      paymentTerms: profileForm.paymentTerms.trim(),
      currency: profileForm.currency.trim(),
      bankInfo: profileForm.bankInfo.trim(),
      creditLimit: profileForm.creditLimit ? parseFloat(profileForm.creditLimit) : undefined,
      taxStatus: profileForm.taxStatus.trim(),
      businessLicense: profileForm.businessLicense.trim(),
      certifications: profileForm.certifications ? profileForm.certifications.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

      sourcingCategory: profileForm.sourcingCategory.trim(),
      leadTimeAverage: profileForm.leadTimeAverage ? parseInt(profileForm.leadTimeAverage) : undefined,
      moq: profileForm.moq ? parseInt(profileForm.moq) : undefined,
      pricingTier: profileForm.pricingTier.trim(),
      qualityRating: profileForm.qualityRating.trim(),
      reliabilityScore: profileForm.reliabilityScore ? parseFloat(profileForm.reliabilityScore) : undefined,
      onTimeDeliveryRate: profileForm.onTimeDeliveryRate ? parseFloat(profileForm.onTimeDeliveryRate) : undefined,
      defectRate: profileForm.defectRate ? parseFloat(profileForm.defectRate) : undefined,
      lastSourcedDate: profileForm.lastSourcedDate || undefined,
      totalSpend: profileForm.totalSpend ? parseFloat(profileForm.totalSpend) : undefined,
      totalOrders: profileForm.totalOrders ? parseInt(profileForm.totalOrders) : undefined,
      isPreferred: profileForm.isPreferred,

      status: profileForm.status,
      sourcingStage: profileForm.sourcingStage,
      approvalDate: profileForm.approvalDate || undefined,
      reviewedBy: profileForm.reviewedBy.trim(),
      nextReviewDate: profileForm.nextReviewDate || undefined,
      riskLevel: profileForm.riskLevel,
      riskNotes: profileForm.riskNotes.trim(),
      createdBy: profileForm.createdBy.trim(),
      ownerPic: profileForm.ownerPic.trim(),
      tags: profileForm.tags ? profileForm.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : [],

      docCompanyProfile: profileForm.docCompanyProfile.trim(),
      docCatalog: profileForm.docCatalog.trim(),
      docContract: profileForm.docContract.trim(),
      docCertificates: profileForm.docCertificates ? profileForm.docCertificates.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      docAuditReports: profileForm.docAuditReports ? profileForm.docAuditReports.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      docSampleApprovals: profileForm.docSampleApprovals ? profileForm.docSampleApprovals.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      docNda: profileForm.docNda.trim(),

      esgScore: profileForm.esgScore ? parseFloat(profileForm.esgScore) : undefined,
      socialResponsibilityNotes: profileForm.socialResponsibilityNotes.trim(),
      maxCapacityMonthly: profileForm.maxCapacityMonthly.trim(),
      mainMarkets: profileForm.mainMarkets ? profileForm.mainMarkets.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      competitors: profileForm.competitors.trim(),
      notes: profileForm.notes.trim(),
      communicationHistory: profileForm.communicationHistory.trim()
    })

    setIsSaving(false)
    if (res.success) {
      setIsEditMode(false)
      router.refresh()
    } else {
      setErrorMessage(res.error || 'Failed to save supplier profile.')
    }
  }

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName.trim() || !defaultPrice) {
      setProductError('Product Name and Default Price are required.')
      return
    }

    setIsSavingProduct(true)
    setProductError(null)

    const price = parseFloat(defaultPrice)
    const moqVal = productMoq ? parseInt(productMoq, 10) : undefined

    const res = await addSupplierCapabilityAction(
      supplier.id, 
      productName, 
      price, 
      leadTime,
      productDescription,
      moqVal,
      productSku,
      productMonthlyCapacity
    )
    setIsSavingProduct(false)

    if (res.success && res.capability) {
      setCapabilities(prev => [...prev, res.capability])
      setIsAddProductOpen(false)
      setProductName('')
      setDefaultPrice('')
      setLeadTime('')
      setProductDescription('')
      setProductMoq('')
      setProductSku('')
      setProductMonthlyCapacity('')
      router.refresh()
    } else {
      setProductError(res.error || 'Failed to add product.')
    }
  }

  const handleEditProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCapability) return
    if (!productName.trim() || !defaultPrice) {
      setProductError('Product Name and Default Price are required.')
      return
    }

    setIsSavingProduct(true)
    setProductError(null)

    const price = parseFloat(defaultPrice)
    const moqVal = productMoq ? parseInt(productMoq, 10) : undefined

    const res = await updateSupplierCapabilityAction(
      supplier.id, 
      editingCapability.id, 
      productName, 
      price, 
      leadTime,
      productDescription,
      moqVal,
      productSku,
      productMonthlyCapacity
    )
    setIsSavingProduct(false)

    if (res.success && res.capability) {
      setCapabilities(prev => prev.map(c => c.id === editingCapability.id ? res.capability : c))
      setIsEditProductOpen(false)
      setEditingCapability(null)
      setProductName('')
      setDefaultPrice('')
      setLeadTime('')
      setProductDescription('')
      setProductMoq('')
      setProductSku('')
      setProductMonthlyCapacity('')
      router.refresh()
    } else {
      setProductError(res.error || 'Failed to update product.')
    }
  }

  const confirmDeleteProduct = async () => {
    if (!deleteConfirmProduct) return
    const id = deleteConfirmProduct.id
    setDeleteConfirmProduct(null)
    setIsDeletingProduct(id)
    const res = await deleteSupplierCapabilityAction(supplier.id, id)
    setIsDeletingProduct(null)

    if (res.success) {
      setCapabilities(prev => prev.filter(c => c.id !== id))
      router.refresh()
    } else {
      alert(res.error || 'Failed to delete product.')
    }
  }

  const handleBack = () => {
    const hasOpener = typeof window !== 'undefined' && !!window.opener
    const hasNoHistory = typeof window !== 'undefined' && window.history.length <= 1

    if (hasOpener || hasNoHistory) {
      window.close()
      setTimeout(() => {
        router.push('/sourcing?subtab=suppliers')
      }, 100)
    } else {
      window.history.back()
    }
  }

  const getInitials = (name: string) => {
    if (!name) return 'SU'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }

  const renderProfileField = (
    label: string,
    key: string,
    type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' = 'text',
    options?: string[]
  ) => {
    const val = (profileForm as any)[key]
    
    if (isEditMode) {
      if (type === 'checkbox') {
        return (
          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id={key}
              checked={Boolean(val)}
              onChange={(e) => setProfileForm(prev => ({ ...prev, [key]: e.target.checked }))}
              className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-4 w-4 cursor-pointer"
            />
            <Label htmlFor={key} className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              {label}
            </Label>
          </div>
        )
      }
      
      if (type === 'textarea') {
        return (
          <div className="space-y-1">
            <Label htmlFor={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Label>
            <textarea
              id={key}
              value={val}
              onChange={(e) => setProfileForm(prev => ({ ...prev, [key]: e.target.value }))}
              rows={3}
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#5c59e9] resize-none animate-in fade-in duration-200"
            />
          </div>
        )
      }
      
      if (type === 'select') {
        return (
          <div className="space-y-1">
            <Label htmlFor={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Label>
            <select
              id={key}
              value={val}
              onChange={(e) => setProfileForm(prev => ({ ...prev, [key]: e.target.value }))}
              className="w-full h-9 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 px-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#5c59e9] cursor-pointer"
            >
              {options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )
      }
      
      return (
        <div className="space-y-1">
          <Label htmlFor={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Label>
          <Input
            id={key}
            type={type}
            value={val}
            onChange={(e) => setProfileForm(prev => ({ ...prev, [key]: e.target.value }))}
            className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-955/50"
          />
        </div>
      )
    }
    
    // Read Mode
    let displayVal = val
    if (type === 'checkbox') {
      displayVal = val ? (
        <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg border border-emerald-250">
          <Check size={14} /> Yes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/30 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <X size={14} /> No
        </span>
      )
    } else if (!val || String(val).trim() === '' || val === '—') {
      displayVal = <span className="text-slate-350 dark:text-slate-655 font-medium italic text-base md:text-lg">Not Specified</span>
    } else {
      if (key === 'email') {
        displayVal = (
          <a href={`mailto:${val}`} className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold text-base md:text-lg">
            {val}
          </a>
        )
      } else if (key === 'website') {
        displayVal = (
          <a
            href={String(val).startsWith('http') ? String(val) : `https://${val}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1 text-base md:text-lg"
          >
            <span>{String(val).replace(/^https?:\/\/(www\.)?/, '')}</span>
            <ArrowUpRight size={14} />
          </a>
        )
      } else if (key.startsWith('doc')) {
        const urls = String(val).split(',').map(s => s.trim()).filter(Boolean)
        displayVal = (
          <div className="flex flex-wrap gap-2 pt-1">
            {urls.map((url, idx) => {
              const cleanName = getCleanFileName(url, `Document ${idx + 1}`)
              return (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-[#5c59e9] border border-indigo-150 hover:border-indigo-250 transition-all dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-900/40 dark:hover:border-indigo-800/60"
                >
                  <FileText size={13} className="shrink-0" />
                  <span className="truncate max-w-[200px]" title={cleanName}>{cleanName}</span>
                  <ArrowUpRight size={12} className="shrink-0 opacity-70" />
                </a>
              )
            })}
          </div>
        )
      } else if (key === 'creditLimit' || key === 'totalSpend') {
        displayVal = <span className="font-extrabold text-slate-900 dark:text-white text-base md:text-lg">${Number(val).toLocaleString()}</span>
      } else if (key === 'reliabilityScore' || key === 'onTimeDeliveryRate' || key === 'defectRate') {
        displayVal = <span className="font-bold text-slate-900 dark:text-white text-base md:text-lg">{val}%</span>
      } else {
        displayVal = <span className="text-slate-900 dark:text-slate-100 font-semibold text-base md:text-lg">{val}</span>
      }
    }
    
    return (
      <div className="border-b border-slate-100 dark:border-slate-850 pb-4 space-y-1 transition-all">
        <span className="text-xs md:text-sm tracking-wider text-slate-500 dark:text-slate-400 font-semibold block uppercase">{label}</span>
        <div>{displayVal}</div>
      </div>
    )
  }

  const audits = supplier.factory_audits || []
  const bids = supplier.order_suppliers || []

  const avgQC = audits.length > 0 ? (audits.reduce((acc: number, curr: any) => acc + (curr.quality_control_score || 0), 0) / audits.length).toFixed(1) : null
  const avgCapacity = audits.length > 0 ? (audits.reduce((acc: number, curr: any) => acc + (curr.production_capacity_score || 0), 0) / audits.length).toFixed(1) : null
  const avgTotal = audits.length > 0 ? (audits.reduce((acc: number, curr: any) => acc + Number(curr.total_score || 0), 0) / audits.length).toFixed(2) : null

  return (
    <div className="space-y-6">
      
      {/* Simple Outside Back Button */}
      <div className="flex items-center">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-850 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer group"
        >
          <ArrowLeft size={16} className="stroke-[2.2] transition-transform group-hover:-translate-x-0.5" />
          <span>Back to directory</span>
        </button>
      </div>

      {/* 1. Main Profile Block */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 flex flex-col md:flex-row gap-8 shadow-sm relative overflow-hidden">
        {/* Accent decoration in background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#5c59e9]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Left Side: Photo/Avatar container */}
        <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-indigo-500 via-[#5c59e9] to-indigo-600 text-white flex items-center justify-center font-black text-3xl shadow-md border-4 border-white dark:border-slate-800 flex-shrink-0 relative overflow-hidden group/avatar">
          {isUploadingLogo ? (
            <Loader2 size={24} className="animate-spin text-white" />
          ) : profileForm.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profileForm.logoUrl}
              alt={profileForm.name}
              className="w-full h-full object-cover"
            />
          ) : (
            getInitials(profileForm.name)
          )}
          
          {/* Overlay to upload logo */}
          <label className="absolute inset-0 bg-black/55 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex flex-col items-center justify-center text-[10px] text-white font-bold cursor-pointer gap-1.5 select-none transition-all duration-200">
            <Upload size={14} className="text-white animate-bounce" />
            <span className="text-[9px]">Upload Logo</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
              disabled={isUploadingLogo}
            />
          </label>
        </div>

        {/* Right Side: Info & Metrics */}
        <div className="flex-1 flex flex-col justify-between space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
              {profileForm.name}
            </h2>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-1">
              {profileForm.businessType || 'Supplier'} &bull; {supplier.created_at ? `Member since ${new Date(supplier.created_at).getFullYear()}` : 'Registered'}
            </p>

            {/* Contact Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-xs mt-4">
              <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400">
                <Phone size={13} className="text-slate-455 dark:text-slate-500 flex-shrink-0" />
                <span>{profileForm.phone || 'Not Specified'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400 min-w-0">
                <Mail size={13} className="text-slate-455 dark:text-slate-500 flex-shrink-0" />
                <span className="truncate">{profileForm.email || 'Not Specified'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400 min-w-0">
                <MapPin size={13} className="text-slate-455 dark:text-slate-500 flex-shrink-0" />
                <span className="truncate">{profileForm.address || 'Not Specified'}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-500 dark:text-slate-400 min-w-0">
                <Globe size={13} className="text-slate-455 dark:text-slate-500 flex-shrink-0" />
                {profileForm.website ? (
                  <a
                    href={profileForm.website.startsWith('http') ? profileForm.website : `https://${profileForm.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#5c59e9] dark:text-indigo-400 hover:underline font-semibold truncate"
                  >
                    {profileForm.website}
                  </a>
                ) : (
                  <span>Not Specified</span>
                )}
              </div>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-3 gap-6 pt-5 border-t border-slate-100 dark:border-slate-800/80">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase block tracking-wider">Active Bids</span>
              <span className="text-lg font-black text-slate-850 dark:text-white mt-1 block">{bids.length}</span>
              <div className="h-[3px] bg-rose-350 dark:bg-rose-500/85 rounded-full mt-2 w-full" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase block tracking-wider">QC Audits</span>
              <span className="text-lg font-black text-slate-855 dark:text-white mt-1 block">{audits.length}</span>
              <div className="h-[3px] bg-teal-400 dark:bg-teal-500/85 rounded-full mt-2 w-full" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase block tracking-wider">Avg Audit Score</span>
              <span className="text-lg font-black text-slate-855 dark:text-white mt-1 block">
                {avgTotal ? `${avgTotal} ★` : '—'}
              </span>
              <div className="h-[3px] bg-lime-400 dark:bg-lime-500/85 rounded-full mt-2 w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Navigation Link Tabs */}
      <div className="flex gap-6 border-b border-slate-200/60 dark:border-slate-800/60 px-4">
        {(
          [
            { id: 'overview', label: 'Overview & Contacts' },
            { id: 'sourcing', label: 'Sourcing & Performance' },
            { id: 'financials', label: 'Financials & Systems' },
            { id: 'documents', label: 'Documents & ESG' },
            { id: 'product', label: 'Product Capabilities' },
            { id: 'library', label: 'Library' },
            { id: 'logs', label: 'Supplier Log' }
          ] as const
        ).map(t => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id)
              setErrorMessage(null)
            }}
            className={`py-4 text-sm md:text-base font-bold relative transition-all cursor-pointer ${
              activeTab === t.id
                ? 'text-[#5c59e9] dark:text-indigo-400 font-black'
                : 'text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
            {activeTab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#5c59e9] dark:bg-indigo-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* 3. Content Workspace */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 shadow-sm min-h-[400px] relative">
        {errorMessage && (
          <div className="mb-6 p-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-955/20 border border-rose-100 rounded-xl flex items-center gap-2 font-semibold">
            <AlertCircle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Global profile tabs edit mode toggle */}
        {activeTab !== 'product' && activeTab !== 'library' && activeTab !== 'logs' && (
          <div className="flex justify-end mb-6">
            {isEditMode ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditMode(false)
                    setErrorMessage(null)
                    // Reset back to supplier values
                    setProfileForm({
                      name: supplier.name || '',
                      email: supplier.email || '',
                      phone: supplier.phone || '',
                      address: supplier.address || '',
                      website: supplier.website || '',
                      contactPerson: supplier.contact_person || '',
                      taxId: supplier.tax_id || '',
                      businessType: supplier.business_type || '',
                      supplierCode: sDetails.supplier_code || '',
                      legalName: sDetails.legal_name || '',
                      yearFounded: sDetails.year_founded ? String(sDetails.year_founded) : '',
                      companySize: sDetails.company_size || '',
                      industry: sDetails.industry || '',
                      mainProducts: sDetails.main_products ? sDetails.main_products.join(', ') : '',
                      shortDescription: sDetails.short_description || '',
                      primaryContactName: sDetails.primary_contact_name || '',
                      position: sDetails.position || '',
                      alternativeContact: sDetails.alternative_contact || '',
                      street: sDetails.street || '',
                      district: sDetails.district || '',
                      city: sDetails.city || '',
                      country: sDetails.country || '',
                      postalCode: sDetails.postal_code || '',
                      linkedin: sDetails.linkedin || '',
                      socialContact: sDetails.social_contact || '',
                      paymentTerms: sDetails.payment_terms || '',
                      currency: sDetails.currency || 'USD',
                      bankInfo: sDetails.bank_info || '',
                      creditLimit: sDetails.credit_limit ? String(sDetails.credit_limit) : '',
                      taxStatus: sDetails.tax_status || '',
                      businessLicense: sDetails.business_license || '',
                      certifications: sDetails.certifications ? sDetails.certifications.join(', ') : '',
                      sourcingCategory: sDetails.sourcing_category || '',
                      leadTimeAverage: sDetails.lead_time_average ? String(sDetails.lead_time_average) : '',
                      moq: sDetails.moq ? String(sDetails.moq) : '',
                      pricingTier: sDetails.pricing_tier || '',
                      qualityRating: sDetails.quality_rating || '',
                      reliabilityScore: sDetails.reliability_score ? String(sDetails.reliability_score) : '',
                      onTimeDeliveryRate: sDetails.on_time_delivery_rate ? String(sDetails.on_time_delivery_rate) : '',
                      defectRate: sDetails.defect_rate ? String(sDetails.defect_rate) : '',
                      lastSourcedDate: sDetails.last_sourced_date || '',
                      totalSpend: sDetails.total_spend ? String(sDetails.total_spend) : '',
                      totalOrders: sDetails.total_orders ? String(sDetails.total_orders) : '',
                      isPreferred: sDetails.is_preferred || false,
                      status: sDetails.status || 'Prospect',
                      sourcingStage: sDetails.sourcing_stage || 'New',
                      approvalDate: sDetails.approval_date || '',
                      reviewedBy: sDetails.reviewed_by || '',
                      nextReviewDate: sDetails.next_review_date || '',
                      riskLevel: sDetails.risk_level || '',
                      riskNotes: sDetails.risk_notes || '',
                      createdBy: sDetails.created_by || '',
                      ownerPic: sDetails.owner_pic || '',
                      tags: sDetails.tags ? sDetails.tags.join(', ') : '',
                      docCompanyProfile: sDetails.doc_company_profile || '',
                      docCatalog: sDetails.doc_catalog || '',
                      docContract: sDetails.doc_contract || '',
                      docCertificates: sDetails.doc_certificates ? sDetails.doc_certificates.join(', ') : '',
                      docAuditReports: sDetails.doc_audit_reports ? sDetails.doc_audit_reports.join(', ') : '',
                      docSampleApprovals: sDetails.doc_sample_approvals ? sDetails.doc_sample_approvals.join(', ') : '',
                      docNda: sDetails.doc_nda || '',
                      esgScore: sDetails.esg_score ? String(sDetails.esg_score) : '',
                      socialResponsibilityNotes: sDetails.social_responsibility_notes || '',
                      maxCapacityMonthly: sDetails.max_capacity_monthly || '',
                      mainMarkets: sDetails.main_markets ? sDetails.main_markets.join(', ') : '',
                      competitors: sDetails.competitors || '',
                      notes: sDetails.notes || '',
                      communicationHistory: sDetails.communication_history || '',
                      logoUrl: sDetails.logo_url || ''
                    })
                  }}
                  className="h-8.5 rounded-lg text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleProfileSave}
                  disabled={isSaving}
                  className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white gap-1.5 h-8.5 rounded-lg text-xs font-semibold"
                >
                  {isSaving && <Loader2 size={12} className="animate-spin" />}
                  <span>Save Changes</span>
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setIsEditMode(true)}
                className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white gap-1.5 h-8.5 rounded-lg text-xs font-semibold"
              >
                <Edit size={12} />
                <span>Edit Profile</span>
              </Button>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {renderProfileField('Company Name', 'name')}
              {renderProfileField('Legal Company Name', 'legalName')}
              {renderProfileField('Supplier ID Code', 'supplierCode')}
              {renderProfileField('Email Address', 'email')}
              {renderProfileField('Phone Number', 'phone')}
              {renderProfileField('Official Website', 'website')}
              {renderProfileField('Contact Person', 'contactPerson')}
              {renderProfileField('Tax ID / Reg Code', 'taxId')}
              {renderProfileField('Business Type', 'businessType')}
              {renderProfileField('Year Founded', 'yearFounded', 'number')}
              {renderProfileField('Company Employee Size', 'companySize')}
              {renderProfileField('Industry Category', 'industry')}

              {/* Company Description - spans 2 columns */}
              <div className="col-span-1 md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6">Company Description</h4>
                <div className="grid grid-cols-1 gap-y-6">
                  {renderProfileField('Main Products & Services Offered', 'mainProducts')}
                  {renderProfileField('Short Description', 'shortDescription', 'textarea')}
                </div>
              </div>

              {/* Detailed Addresses & Social Media - spans 2 columns */}
              <div className="col-span-1 md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6">Detailed Addresses & Social Media</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                  {renderProfileField('Street Address', 'street')}
                  {renderProfileField('District / Ward', 'district')}
                  {renderProfileField('City / Province', 'city')}
                  {renderProfileField('Country', 'country')}
                  {renderProfileField('Postal Code', 'postalCode')}
                  {renderProfileField('LinkedIn Company Profile', 'linkedin')}
                  {renderProfileField('Zalo / WeChat Contact ID', 'socialContact')}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sourcing' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {renderProfileField('Sourcing Category Scope', 'sourcingCategory')}
              {renderProfileField('Average Lead Time (Days)', 'leadTimeAverage', 'number')}
              {renderProfileField('Minimum Order Quantity (MOQ)', 'moq', 'number')}
              {renderProfileField('Pricing Tier Label', 'pricingTier')}
              {renderProfileField('Quality Evaluation Grade', 'qualityRating')}
              {renderProfileField('Reliability Score (%)', 'reliabilityScore', 'number')}
              {renderProfileField('On-Time Delivery Rate (%)', 'onTimeDeliveryRate', 'number')}
              {renderProfileField('Manufacturing Defect Rate (%)', 'defectRate', 'number')}
              {renderProfileField('Last Sourced Date', 'lastSourcedDate', 'date')}
              {renderProfileField('Accumulated Sourcing Spend', 'totalSpend', 'number')}
              {renderProfileField('Total Sourcing Orders Count', 'totalOrders', 'number')}
              {renderProfileField('Preferred Sourcing Supplier Status', 'isPreferred', 'checkbox')}
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {renderProfileField('Payment Terms Context', 'paymentTerms')}
              {renderProfileField('Billing Currency Symbol', 'currency', 'select', ['USD', 'VND', 'EUR', 'CNY'])}
              {renderProfileField('Bank Account & SWIFT Info', 'bankInfo')}
              {renderProfileField('Assigned Credit Limit', 'creditLimit', 'number')}
              {renderProfileField('Tax Registration Status', 'taxStatus')}
              {renderProfileField('Business License Link / Details', 'businessLicense')}
              {renderProfileField('Certifications & Standards (Comma Separated)', 'certifications')}
            </div>

            <div className="col-span-1 md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6">Internal Workflow Stages & Risk Assessment</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {renderProfileField('Verification Status', 'status', 'select', ['Prospect', 'Active', 'Suspended'])}
                {renderProfileField('Sourcing Pipeline Stage', 'sourcingStage', 'select', ['New', 'In-Negotiation', 'Verified', 'Approved', 'Rejected'])}
                {renderProfileField('Approval Date', 'approvalDate', 'date')}
                {renderProfileField('Reviewed By Auditor PIC', 'reviewedBy')}
                {renderProfileField('Next Assessment Review Date', 'nextReviewDate', 'date')}
                {renderProfileField('Risk Evaluation Level', 'riskLevel', 'select', ['Low', 'Medium', 'High', 'Critical'])}
                {renderProfileField('Internal Sourcing Created By', 'createdBy')}
                {renderProfileField('Assigned Owner PIC', 'ownerPic')}
                {renderProfileField('Category Tags (Comma Separated)', 'tags')}
                {renderProfileField('Internal Risk Notes & Comments', 'riskNotes', 'textarea')}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
              {renderProfileField('ESG Compliance Grade / Score', 'esgScore', 'number')}
              {renderProfileField('Max Monthly Manufacturing Capacity', 'maxCapacityMonthly')}
              {renderProfileField('Competitors Matrix References', 'competitors')}
            </div>

            <div className="col-span-1 md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6">ESG Notes & Manufacturing Markets</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {renderProfileField('Main Export Destination Markets (Comma Separated)', 'mainMarkets')}
                {renderProfileField('Social & Environmental Responsibility Notes', 'socialResponsibilityNotes', 'textarea')}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6">Document Attachment Links</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {renderProfileField('Company Profile Document Link', 'docCompanyProfile')}
                {renderProfileField('Product Catalog File Link', 'docCatalog')}
                {renderProfileField('General Purchase Contract Link', 'docContract')}
                {renderProfileField('NDA Agreement File Link', 'docNda')}
                {renderProfileField('Standards Certifications Links (Comma Separated)', 'docCertificates')}
                {renderProfileField('Audit Reports Links (Comma Separated)', 'docAuditReports')}
                {renderProfileField('Sample Approval Docs Links (Comma Separated)', 'docSampleApprovals')}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 pt-6 border-t border-slate-100 dark:border-slate-800 mt-2">
              <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-6">Supplier Context Notes</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                {renderProfileField('Internal Sourcing Comments', 'notes', 'textarea')}
                {renderProfileField('Communication & Call History Log', 'communicationHistory', 'textarea')}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'product' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header section */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Supplier Product Lines</h3>
              <button
                onClick={() => {
                  setProductName('')
                  setDefaultPrice('')
                  setLeadTime('')
                  setProductDescription('')
                  setProductMoq('')
                  setProductSku('')
                  setProductMonthlyCapacity('')
                  setProductError(null)
                  setIsAddProductOpen(true)
                }}
                className="h-9 text-xs bg-[#5c59e9] hover:bg-[#4a47d2] text-white rounded-lg px-4 flex items-center gap-1.5 cursor-pointer font-semibold shadow-sm"
              >
                <Plus size={14} />
                <span>Add Product</span>
              </button>
            </div>

            {/* Main Grid Table */}
            {capabilities.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/10 dark:bg-slate-900/5">
                <span className="text-xs text-slate-400 font-medium">No products registered for this supplier.</span>
              </div>
            ) : (
              <div className="border border-slate-100 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-slate-50/10 dark:bg-slate-900/5">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Product Name</th>
                      <th className="px-5 py-3">SKU</th>
                      <th className="px-5 py-3 text-right">Default Price</th>
                      <th className="px-5 py-3 text-right">Lead Time</th>
                      <th className="px-5 py-3 text-right">Min Order Qty (MOQ)</th>
                      <th className="px-5 py-3 text-right">Production Capacity</th>
                      <th className="px-5 py-3 text-center w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {capabilities.map((cap) => (
                      <tr key={cap.id} className="hover:bg-slate-50/30">
                        <td className="px-5 py-3.5 font-bold text-slate-800 dark:text-slate-200">
                          <div>
                            <span className="block text-slate-800 dark:text-slate-200 font-bold">{cap.product_name}</span>
                            {cap.description && (
                              <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5 max-w-xs truncate">
                                {cap.description}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-550 dark:text-slate-400">
                          {cap.sku || <span className="text-slate-350 dark:text-slate-600 font-medium italic">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right font-extrabold text-slate-800 dark:text-white">
                          ${Number(cap.target_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400 font-semibold">
                          {cap.lead_time_days != null ? `${cap.lead_time_days} days` : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400 font-semibold">
                          {cap.moq != null ? `${Number(cap.moq).toLocaleString()} units` : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400 font-semibold">
                          {cap.monthly_capacity || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedHistoryProduct(cap.product_name)}
                              className="p-1.5 text-slate-400 hover:text-[#5c59e9] dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="View History Charts"
                            >
                              <TrendingUp size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCapability(cap)
                                setProductName(cap.product_name)
                                setDefaultPrice(String(cap.target_price || ''))
                                setLeadTime(cap.lead_time_days != null ? String(cap.lead_time_days) : '')
                                setProductDescription(cap.description || '')
                                setProductMoq(cap.moq != null ? String(cap.moq) : '')
                                setProductSku(cap.sku || '')
                                setProductMonthlyCapacity(cap.monthly_capacity || '')
                                setProductError(null)
                                setIsEditProductOpen(true)
                              }}
                              className="p-1.5 text-slate-400 hover:text-[#5c59e9] dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Edit product"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmProduct(cap)}
                              disabled={isDeletingProduct === cap.id}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Delete product"
                            >
                              {isDeletingProduct === cap.id ? (
                                <Loader2 size={14} className="animate-spin text-red-500" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'library' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header section with Stats & Upload */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-wider">Supplier Resource Library</h3>
                <p className="text-xs text-slate-500 mt-1">Manage documents, certificates, catalog files, and attachments.</p>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setLibrarySelectedFiles([])
                  setIsUploadModalOpen(true)
                }}
                className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white gap-1.5 h-8.5 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <Upload size={12} />
                <span>Upload File</span>
              </Button>
            </div>

            {/* Quick Filter buttons */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all', label: 'All Files' },
                  { id: 'profile', label: 'Company Profile' },
                  { id: 'catalog', label: 'Product Catalog' },
                  { id: 'contract', label: 'Purchase Contract' },
                  { id: 'nda', label: 'NDA Agreement' },
                  { id: 'certificate', label: 'Certificates' },
                  { id: 'audit', label: 'Audit Reports' },
                  { id: 'sample', label: 'Sample Approvals' },
                  { id: 'images', label: 'Images' }
                ] as const
              ).map(filter => {
                const count = getLibraryFiles().filter(file => {
                  if (filter.id === 'all') return true
                  if (filter.id === 'images') return /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(file.url)
                  return file.category === filter.id
                }).length

                return (
                  <button
                    key={filter.id}
                    onClick={() => setLibraryFilter(filter.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      libraryFilter === filter.id
                        ? 'bg-[#5c59e9]/10 border-[#5c59e9]/30 text-[#5c59e9] dark:bg-indigo-400/10 dark:border-indigo-400/30 dark:text-indigo-400'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-905 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span className="ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Resource Grid */}
            {getLibraryFiles().filter(file => {
              if (libraryFilter === 'all') return true
              if (libraryFilter === 'images') return /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(file.url)
              return file.category === libraryFilter
            }).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-150 dark:border-slate-800 rounded-3xl">
                <FileText className="text-slate-300 dark:text-slate-665 mb-3" size={40} />
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No resources found</p>
                <p className="text-xs text-slate-400 mt-0.5">Use the upload box above to add resources to this supplier library.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {getLibraryFiles()
                  .filter(file => {
                    if (libraryFilter === 'all') return true
                    if (libraryFilter === 'images') return /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(file.url)
                    return file.category === libraryFilter
                  })
                  .map(file => {
                    const isImg = /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(file.url)
                    const isPdf = /\.pdf(\?.*)?$/i.test(file.url)

                    return (
                      <div
                        key={file.id}
                        className="group relative bg-white dark:bg-slate-905 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all hover:border-[#5c59e9]/35 dark:hover:border-indigo-400/35 overflow-hidden flex flex-col justify-between"
                      >
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/card block cursor-pointer"
                        >
                          {/* File Preview Area */}
                          <div className="aspect-video w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-850 overflow-hidden flex items-center justify-center mb-3 relative group-hover/card:brightness-95 transition-all">
                            {isImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={file.url}
                                alt={file.name}
                                className="object-cover w-full h-full"
                              />
                            ) : isPdf ? (
                              <FileText size={32} className="text-rose-500" />
                            ) : (
                              <File size={32} className="text-indigo-500" />
                            )}
                            <span className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-900/80 text-white uppercase backdrop-blur-xs">
                              {file.category}
                            </span>
                          </div>

                          {/* File Details */}
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover/card:text-[#5c59e9] dark:group-hover/card:text-indigo-400 transition-all truncate" title={file.name}>
                              {file.name}
                            </h4>
                          </div>
                        </a>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 mt-4 pt-3 border-t border-slate-100 dark:border-slate-850">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
                            title="View File"
                          >
                            <ExternalLink size={14} />
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(file.url)
                              setCopiedFileId(file.id)
                              setTimeout(() => setCopiedFileId(null), 1500)
                            }}
                            className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
                            title="Copy Link"
                          >
                            {copiedFileId === file.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                          </button>
                          <button
                            onClick={() => handleDeleteLibraryFile(file)}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all ml-auto cursor-pointer"
                            title="Delete File"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Upload Modal Popup */}
            {isUploadModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => {
                    if (!isUploadingLibrary) setIsUploadModalOpen(false)
                  }}
                />
                <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 animate-in zoom-in-95 duration-150 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-850 dark:text-slate-100 uppercase tracking-wider">Upload Attachments</h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">Select a category and choose one or more files to upload.</p>
                    </div>
                    <button
                      onClick={() => setIsUploadModalOpen(false)}
                      disabled={isUploadingLibrary}
                      className="p-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Category Dropdown */}
                  <div className="space-y-1.5">
                    <Label htmlFor="library-upload-category" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Document Category
                    </Label>
                    <select
                      id="library-upload-category"
                      value={selectedUploadCategory}
                      onChange={(e: any) => setSelectedUploadCategory(e.target.value)}
                      disabled={isUploadingLibrary}
                      className="w-full h-9 text-xs rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-slate-850 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#5c59e9] cursor-pointer"
                    >
                      <option value="profile">Company Profile (Single File)</option>
                      <option value="catalog">Product Catalog (Single File)</option>
                      <option value="contract">Purchase Contract (Single File)</option>
                      <option value="nda">NDA Agreement (Single File)</option>
                      <option value="certificate">Certificate (Multiple Files)</option>
                      <option value="audit">Audit Report (Multiple Files)</option>
                      <option value="sample">Sample Approval (Multiple Files)</option>
                    </select>
                  </div>

                  {/* File Pick Area */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Files</Label>
                    <div
                      onClick={() => {
                        if (!isUploadingLibrary) document.getElementById('library-popup-file-input')?.click()
                      }}
                      className="border-2 border-dashed border-slate-250 dark:border-slate-800 hover:border-[#5c59e9]/50 dark:hover:border-indigo-400/50 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/30 hover:bg-slate-50/60 dark:bg-slate-950/20"
                    >
                      <Upload className="text-slate-400 mb-2" size={24} />
                      <span className="text-xs font-semibold text-slate-750 dark:text-slate-350">Click to browse files</span>
                      <span className="text-[10px] text-slate-400 mt-1">Supports multiple files selection</span>
                      <input
                        type="file"
                        id="library-popup-file-input"
                        className="hidden"
                        multiple={true}
                        onChange={handleFileChange}
                        disabled={isUploadingLibrary}
                      />
                    </div>
                  </div>

                  {/* Selected files preview */}
                  {librarySelectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                        Selected Files ({librarySelectedFiles.length})
                      </Label>
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-slate-100 dark:border-slate-850 p-2 rounded-xl bg-slate-50/20">
                        {librarySelectedFiles.map((file, idx) => (
                          <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-lg border border-slate-100 dark:border-slate-850 bg-white dark:bg-slate-950/60">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider truncate max-w-[280px]" title={file.name}>
                                File: {file.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-medium">({(file.size / 1024).toFixed(0)} KB)</span>
                                <button
                                  type="button"
                                  disabled={isUploadingLibrary}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeSelectedFile(idx);
                                  }}
                                  className="text-slate-450 hover:text-rose-500 p-0.5 rounded transition-all cursor-pointer"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Upload Name:</span>
                              <input
                                type="text"
                                disabled={isUploadingLibrary}
                                placeholder="Rename file (optional)..."
                                value={fileCustomNames[idx] || ''}
                                onChange={(e) => {
                                  setFileCustomNames(prev => ({
                                    ...prev,
                                    [idx]: e.target.value
                                  }))
                                }}
                                className="w-full h-7 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2 py-0.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#5c59e9]"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="flex gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-850">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsUploadModalOpen(false)}
                      disabled={isUploadingLibrary}
                      className="flex-1 h-9 text-xs font-semibold cursor-pointer rounded-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={isUploadingLibrary || librarySelectedFiles.length === 0}
                      onClick={handleLibraryBatchUpload}
                      className="flex-1 h-9 text-xs font-semibold bg-[#5c59e9] hover:bg-[#4a47d2] text-white cursor-pointer gap-1.5 rounded-xl"
                    >
                      {isUploadingLibrary ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={12} />
                          <span>Upload ({librarySelectedFiles.length}) Files</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-wider">Supplier Activity &amp; Change Log</h3>
              <p className="text-xs text-slate-500 mt-1">Audit trail of all edits made to the supplier profile and capabilities.</p>
            </div>

            <div className="border border-slate-200/60 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/10">
              {!supplier.supplier_product_history || supplier.supplier_product_history.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm italic">
                  No activity log entries found for this supplier.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...supplier.supplier_product_history]
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((log: any) => {
                      const dateStr = new Date(log.created_at).toLocaleString()
                      let title = log.product_name
                      let badgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-350'
                      
                      if (log.event_type === 'PROFILE_UPDATE') {
                        title = 'Profile Updated'
                        badgeColor = 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400'
                      } else if (log.event_type === 'CAPABILITY_CREATE') {
                        title = `Product Added: ${log.product_name}`
                        badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400'
                      } else if (log.event_type === 'CAPABILITY_UPDATE') {
                        title = `Product Updated: ${log.product_name}`
                        badgeColor = 'bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-955/20 dark:text-amber-400'
                      } else if (log.event_type === 'CAPABILITY_DELETE') {
                        title = `Product Deleted: ${log.product_name}`
                        badgeColor = 'bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-455'
                      }

                      return (
                        <div key={log.id} className="p-4 flex flex-col md:flex-row md:items-start gap-4 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors">
                          <div className="min-w-[150px] shrink-0">
                            <span className="font-semibold text-slate-400 block">{dateStr}</span>
                            <span className="text-[10px] text-slate-400">By {log.created_by || 'System'}</span>
                          </div>
                          
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge className={`text-[10px] font-bold px-2 py-0.5 border ${badgeColor}`}>
                                {title}
                              </Badge>
                              {log.price > 0 && (
                                <span className="font-semibold text-slate-600 dark:text-slate-400">
                                  Price: ${log.price}
                                </span>
                              )}
                            </div>
                            
                            {log.capacity && (
                              <div className="text-slate-600 dark:text-slate-350 bg-slate-50 dark:bg-slate-950/30 p-2.5 rounded-xl font-mono text-[11px] whitespace-pre-line border border-slate-100 dark:border-slate-850">
                                {log.capacity}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Product Dialog */}
      {isAddProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsAddProductOpen(false); setProductError(null) }}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Product Line</h3>
              </div>
              <button
                onClick={() => { setIsAddProductOpen(false); setProductError(null) }}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddProductSubmit} className="p-5 space-y-4">
              {productError && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-955/20 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
                  {productError}
                </div>
              )}

              {/* Product Name */}
              <div className="space-y-1.5">
                <Label htmlFor="product-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="product-name"
                  placeholder="e.g. Oak Dining Table"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                  required
                />
              </div>

              {/* SKU & MOQ */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="product-sku" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Product SKU
                  </Label>
                  <Input
                    id="product-sku"
                    placeholder="e.g. ODT-042"
                    value={productSku}
                    onChange={e => setProductSku(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-moq" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Min Order Qty (MOQ)
                  </Label>
                  <Input
                    id="product-moq"
                    type="number"
                    placeholder="e.g. 50"
                    value={productMoq}
                    onChange={e => setProductMoq(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-955/50"
                  />
                </div>
              </div>

              {/* Price & Leadtime */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="product-price" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Default Price ($) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="product-price"
                    type="number"
                    step="0.01"
                    placeholder="120.00"
                    value={defaultPrice}
                    onChange={e => setDefaultPrice(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-955/50"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-leadtime" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lead Time (days)
                  </Label>
                  <Input
                    id="product-leadtime"
                    type="text"
                    placeholder="e.g. 7-10"
                    value={leadTime}
                    onChange={e => setLeadTime(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-955/50"
                  />
                </div>
              </div>

              {/* Production Capacity */}
              <div className="space-y-1.5">
                <Label htmlFor="product-capacity" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Production Capacity
                </Label>
                <Input
                  id="product-capacity"
                  placeholder="e.g. 1,000 units / month"
                  value={productMonthlyCapacity}
                  onChange={e => setProductMonthlyCapacity(e.target.value)}
                  className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="product-desc" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product Description
                </Label>
                <textarea
                  id="product-desc"
                  placeholder="Describe material, specifications, quality details..."
                  rows={2}
                  value={productDescription}
                  onChange={e => setProductDescription(e.target.value)}
                  className="flex w-full rounded-xl border border-slate-200 bg-white/50 px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-955 resize-none animate-in fade-in duration-200"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsAddProductOpen(false); setProductError(null) }}
                  className="flex-1 h-9 text-xs font-semibold cursor-pointer rounded-xl"
                  disabled={isSavingProduct}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingProduct}
                  className="flex-1 h-9 text-xs font-semibold bg-[#5c59e9] hover:bg-[#4a47d2] text-white cursor-pointer gap-1.5 rounded-xl"
                >
                  {isSavingProduct && <Loader2 size={12} className="animate-spin" />}
                  <span>Save Product</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Dialog */}
      {isEditProductOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsEditProductOpen(false); setProductError(null); setEditingCapability(null) }}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Edit Product Line</h3>
              </div>
              <button
                onClick={() => { setIsEditProductOpen(false); setProductError(null); setEditingCapability(null) }}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleEditProductSubmit} className="p-5 space-y-4">
              {productError && (
                <div className="text-xs text-red-650 dark:text-red-400 bg-red-50 dark:bg-red-955/20 p-2.5 rounded-lg border border-red-200 dark:border-red-900">
                  {productError}
                </div>
              )}

              {/* Product Name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-product-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-product-name"
                  placeholder="e.g. Oak Dining Table"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                  required
                />
              </div>

              {/* SKU & MOQ */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-product-sku" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Product SKU
                  </Label>
                  <Input
                    id="edit-product-sku"
                    placeholder="e.g. ODT-042"
                    value={productSku}
                    onChange={e => setProductSku(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-product-moq" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Min Order Qty (MOQ)
                  </Label>
                  <Input
                    id="edit-product-moq"
                    type="number"
                    placeholder="e.g. 50"
                    value={productMoq}
                    onChange={e => setProductMoq(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-855 dark:bg-slate-950/50"
                  />
                </div>
              </div>

              {/* Price & Leadtime */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-product-price" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Default Price ($) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="edit-product-price"
                    type="number"
                    step="0.01"
                    placeholder="120.00"
                    value={defaultPrice}
                    onChange={e => setDefaultPrice(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-855 dark:bg-slate-950/50"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-product-leadtime" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lead Time (days)
                  </Label>
                  <Input
                    id="edit-product-leadtime"
                    type="text"
                    placeholder="e.g. 7-10"
                    value={leadTime}
                    onChange={e => setLeadTime(e.target.value)}
                    className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-955/50"
                  />
                </div>
              </div>

              {/* Production Capacity */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-product-capacity" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Production Capacity
                </Label>
                <Input
                  id="edit-product-capacity"
                  placeholder="e.g. 1,000 units / month"
                  value={productMonthlyCapacity}
                  onChange={e => setProductMonthlyCapacity(e.target.value)}
                  className="text-xs h-9 rounded-xl border-slate-200 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-product-desc" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Product Description
                </Label>
                <textarea
                  id="edit-product-desc"
                  placeholder="Describe material, specifications, quality details..."
                  rows={2}
                  value={productDescription}
                  onChange={e => setProductDescription(e.target.value)}
                  className="flex w-full rounded-xl border border-slate-200 bg-white/50 px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-955 resize-none animate-in fade-in duration-200"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsEditProductOpen(false); setProductError(null); setEditingCapability(null) }}
                  className="flex-1 h-9 text-xs font-semibold cursor-pointer rounded-xl"
                  disabled={isSavingProduct}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingProduct}
                  className="flex-1 h-9 text-xs font-semibold bg-[#5c59e9] hover:bg-[#4a47d2] text-white cursor-pointer gap-1.5 rounded-xl"
                >
                  {isSavingProduct && <Loader2 size={12} className="animate-spin" />}
                  <span>Save Changes</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Beautiful Custom Delete Confirmation Modal */}
      {deleteConfirmFile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmFile(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 animate-in zoom-in-95 duration-150 text-center">
            {/* Warning icon */}
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/20 text-rose-500 flex items-center justify-center mb-4">
              <Trash2 size={20} />
            </div>
            
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Remove Resource File
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Are you sure you want to permanently remove <span className="text-slate-800 dark:text-slate-250 font-semibold break-all">&ldquo;{deleteConfirmFile.name}&rdquo;</span>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmFile(null)}
                className="flex-1 h-9.5 text-xs font-semibold cursor-pointer rounded-xl"
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDeleteLibraryFile}
                className="flex-1 h-9.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer rounded-xl"
                disabled={isSaving}
              >
                {isSaving && <Loader2 size={12} className="animate-spin" />}
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Product Delete Confirmation Modal */}
      {deleteConfirmProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmProduct(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 animate-in zoom-in-95 duration-150 text-center">
            {/* Warning icon */}
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/20 text-rose-500 flex items-center justify-center mb-4">
              <Trash2 size={20} />
            </div>
            
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Delete Product Capability
            </h3>
            
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Are you sure you want to permanently delete the product capability <span className="text-slate-800 dark:text-slate-250 font-semibold break-all">&ldquo;{deleteConfirmProduct.product_name}&rdquo;</span>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmProduct(null)}
                className="flex-1 h-9.5 text-xs font-semibold cursor-pointer rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDeleteProduct}
                className="flex-1 h-9.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer rounded-xl border-none"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedHistoryProduct && (
        <HistoryChartsModal
          supplierId={supplier.id}
          supplierName={supplier.name}
          productName={selectedHistoryProduct}
          onClose={() => setSelectedHistoryProduct(null)}
        />
      )}

      {/* Premium Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[120] flex flex-col gap-3 max-w-md w-full pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3.5 rounded-2xl shadow-xl border flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-100 text-rose-800 dark:bg-rose-955/25 dark:border-rose-900/50 dark:text-rose-450'
                : 'bg-white border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
            )}
            <span className="text-xs font-semibold leading-relaxed">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
