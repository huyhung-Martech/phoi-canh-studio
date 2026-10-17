# 🎬 Phối Cảnh Studio - Video Generator BĐS

Công cụ dựng video ngắn giới thiệu tiện ích và quy hoạch BĐS từ ảnh tĩnh phối cảnh, phát triển cùng Claude Code, render trực tiếp trên trình duyệt bằng Canvas 2D và WebCodecs.

Ứng dụng web thuần Client-side (HTML5/Canvas/WebCodecs), không cần server render. Online: <https://huyhung-martech.github.io/phoi-canh-studio/tool/>

## 📁 Cấu trúc thư mục dự án
*   [`tool/index.html`](tool/index.html): Giao diện studio trực quan với timeline, quản lý lớp hiệu ứng và màn hình preview.
*   [`tool/app.js`](tool/app.js): Bộ điều khiển logic chính: xử lý thao tác chỉnh sửa, layer, camera keyframes, lưu/mở file dự án JSON và xuất video MP4 (WebCodecs + mp4-muxer).
*   [`tool/render.js`](tool/render.js): Bộ vẽ Canvas đa tầng dùng chung cho xem trước và render video: vẽ đường phát sáng neon, ghim 3D pulse, nhãn tiện ích, chữ nghiêng theo góc phối cảnh.
*   [`tool/audio.js`](tool/audio.js): Xử lý nhạc nền và hòa âm theo timeline video.
*   [`tool/demo.json`](tool/demo.json): Dự án mẫu thiết lập sẵn 20 giây với đầy đủ dữ liệu điểm ghim và tuyến đường.
*   `demo-phoi-canh/`: Kho ảnh nền phối cảnh và video thành phẩm đã xuất.
*   `Mở Phối Cảnh Studio.bat`: Script khởi động nhanh 1 chạm cho môi trường Windows.

## 🎨 Thông tin thiết kế chính (Design System)
*   **Tông màu giao diện:**
    *   `Dark Studio (#111827 / #1F2937)`: Tông tối chuyên nghiệp giúp làm nổi bật ảnh phối cảnh khi biên tập.
    *   `Neon Cyan (#06B6D4)`: Màu tia sáng tuyến đường giao thông kết nối phát sáng.
    *   `Accent Amber (#F59E0B)`: Điểm ghim vị trí trung tâm và thẻ thông số nổi bật.
    *   `Emerald Green (#10B981)`: Điểm mốc tiện ích sinh thái xanh (công viên, hồ bơi).
*   **Fonts:**
    *   Giao diện công cụ & Nhãn trên ảnh: *Inter*, *Roboto*.

## 🚀 Chạy thử
**Cách 1:** Nhấp đúp vào file `Mở Phối Cảnh Studio.bat` để tự động mở trình duyệt.

**Cách 2:** Khởi chạy server tĩnh cục bộ bằng Python:

```bash
python -m http.server 5180
# rồi mở http://localhost:5180/tool/
```

## 📌 Hướng dẫn sử dụng & Việc cần làm

### 1. Bắt đầu dự án mới
*   Nhấp nút **Mở ảnh**, chọn ảnh phối cảnh độ nét cao của dự án.
*   Dữ liệu dự án và hình ảnh chỉ lưu trên trình duyệt của người dùng thông qua IndexedDB nội bộ, không gửi lên máy chủ bên ngoài. Muốn chuyển máy thì dùng nút **Lưu tệp** / **Mở tệp** (JSON).

### 2. Thêm hiệu ứng đường nối & điểm ghim
*   **Tuyến đường phát sáng:** Click các điểm trên ảnh để tạo đường nối cao tốc/vành đai, điều chỉnh độ dày và màu phát sáng.
*   **Ghim vị trí 3D:** Click vào tọa độ các tiện ích xung quanh (trường học, bệnh viện, TTTM), nhập cự ly (ví dụ: *5 phút*).

### 3. Xuất video MP4
*   Nhấp **Xuất video MP4**, trình duyệt sẽ sử dụng WebCodecs tăng tốc phần cứng để render khung hình và xuất file MP4 trực tiếp về máy trong vài giây.

## 🖼️ Quy ước xử lý ảnh đầu vào
Để video xuất ra đạt chất lượng Full HD sắc nét nhất:

| Loại tệp | Định dạng | Kích thước khuyến nghị |
| --- | --- | --- |
| Ảnh nền phối cảnh | JPG / PNG | 1920×1080 hoặc 2560×1440 (Tỷ lệ 16:9) |
| Logo dự án chèn góc | PNG trong suốt | Chiều ngang 300px–500px |
| Nhạc nền | MP3 | 128kbps – 192kbps |
