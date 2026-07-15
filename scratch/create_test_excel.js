const XLSX = require('xlsx');

const data = [
  {
    "Tên": "Nguyen Van Test Excel",
    "Công ty": "Nha May Hoa Binh Test Excel",
    "MST": "9876543210",
    "Ngày hoạt động công ty": "12/08/2015",
    "Sdt": "0987654321",
    "Website": "https://hoabinhfurniture.com",
    "Email": "info@hoabinhfurniture.com",
    "Địa chỉ": "Khu công nghiệp VSIP, Bình Dương",
    "Điều kiện thanh toán": "Deposit 30%, Balance 70% before shipment",
    "Diện tích nhà xưởng": "6000 m2",
    "Tổng lực lượng con người": "200",
    "Nhân công lao động": "170",
    "Năng lực sản xuất/ tháng": "15 cont/tháng",
    "Chủ lực dòng hàng": "Outdoor Wooden Furniture",
    "Gỗ chủ lực làm": "Gỗ tràm, gỗ sồi",
    "notes": "Nhà máy đạt tiêu chuẩn xuất khẩu châu Âu"
  },
  {
    "Tên": "Tran Thi Test Excel",
    "Công ty": "Nha May Thuan Phat Test Excel",
    "MST": "1234567890",
    "Ngày hoạt động công ty": "01/01/2020",
    "Sdt": "0912345678",
    "Website": "https://thuanphatwood.vn",
    "Email": "contact@thuanphatwood.vn",
    "Địa chỉ": "Hố Nai, Đồng Nai",
    "Điều kiện thanh toán": "LC at sight",
    "Diện tích nhà xưởng": "3500 m2",
    "Tổng lực lượng con người": "80",
    "Nhân công lao động": "60",
    "Năng lực sản xuất/ tháng": "8 cont/tháng",
    "Chủ lực dòng hàng": "Indoor Tables and Chairs",
    "Gỗ chủ lực làm": "Gỗ cao su, MDF",
    "notes": "Nhà máy chuyên bàn ghế ăn gỗ tự nhiên"
  }
];

const worksheet = XLSX.utils.json_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet 1");

const outputPath = "d:/TR/Sourcing Hub/Tài liệu/test_supplier_import.xlsx";
XLSX.writeFile(workbook, outputPath);
console.log("Excel file created successfully at: " + outputPath);
