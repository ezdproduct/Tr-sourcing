const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://cgepdrwahacxkvktzgjh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZXBkcndhaGFjeGt2a3R6Z2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxODQ3MDAsImV4cCI6MjA5Nzc2MDcwMH0.OX4jaE2dHeTSSzFRQzykMOEe5voDNyvAb8-6YMzce-8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    console.log('Testing orders select...');
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id, order_code')
      .limit(5);
    if (oErr) console.error('Orders error:', oErr);
    else console.log('Orders sample:', orders);

    console.log('Testing suppliers select...');
    const { data: suppliers, error: sErr } = await supabase
      .from('suppliers')
      .select('id, email')
      .limit(5);
    if (sErr) console.error('Suppliers error:', sErr);
    else console.log('Suppliers sample:', suppliers);

    if (orders && orders.length > 0 && suppliers && suppliers.length > 0) {
      const orderIds = [orders[0].id];
      const supplierIds = [suppliers[0].id];
      console.log('Testing order_suppliers select with filter...', { orderIds, supplierIds });
      const { data: bids, error: bErr } = await supabase
        .from('order_suppliers')
        .select(`
          id,
          supplier_name,
          quoted_price,
          lead_time_days,
          suppliers(email),
          orders(order_code),
          order_items(item_name)
        `)
        .in('order_id', orderIds)
        .in('supplier_id', supplierIds);
      if (bErr) console.error('Bids error:', bErr);
      else console.log('Bids sample:', bids);
    }
  } catch (err) {
    console.error('Test catch:', err);
  }
}

test();
