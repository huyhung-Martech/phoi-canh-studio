# 🎬 Phối Cảnh Studio — Video Generator Từ Ảnh Phối Cảnh BĐS

[![Demo Online](https://img.shields.io/badge/Live%20Tool-GitHub%20Pages-2ea44f?style=for-the-badge&logo=github&logoColor=white)](https://huyhung-martech.github.io/phoi-canh-studio/tool/)
[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-d97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://claude.ai/)
[![WebCodecs](https://img.shields.io/badge/Tech-WebCodecs%20%2B%20Canvas-6366f1?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)

**Phối Cảnh Studio** là giải pháp phần mềm chuyên dụng cho Marketing Bất động sản, cho phép dựng các đoạn video ngắn quảng cáo, giới thiệu vị trí và tiện ích dự án **trực tiếp từ ảnh tĩnh phối cảnh** ngay trên trình duyệt web mà không cần phần mềm dựng phim phức tạp (After Effects, Premiere) hay máy chủ render tốn kém.

Dự án được xây dựng và tối ưu hoàn thiện thông qua công cụ lập trình AI **Claude Code** (tháng 10/2026).

---

## 🌐 Đường Dẫn Sử Dụng Trực Tiếp (Không Cần Cài Đặt)

* **Link Web Online (GitHub Pages):** 👉 **[https://huyhung-martech.github.io/phoi-canh-studio/tool/](https://huyhung-martech.github.io/phoi-canh-studio/tool/)**
*(Khuyến nghị sử dụng trình duyệt Google Chrome hoặc Microsoft Edge phiên bản mới để tận dụng WebCodecs tăng tốc phần cứng)*.

---

## ⚡ Các Tính Năng Nổi Bật

1. **Ghim vị trí & Điểm mốc thông minh:** Ghim biểu tượng pin 3D, icon phân khu, tiện ích với hiệu ứng nhịp tim (pulse) và chuyển động sóng tỏa.
2. **Vẽ tuyến đường phát sáng (Neon Highway Effect):** Kẻ các cung đường kết nối giao thông (cao tốc, đường vành đai, metro) với hiệu ứng tia sáng chạy dọc tuyến đường chân thực.
3. **Tô khối căn hộ / Tòa tháp (Building Highlighting):** Đánh dấu vùng phân khu hoặc khối tòa nhà nổi bật trên ảnh phối cảnh tổng thể.
4. **Thẻ thông số & Chữ nghiêng theo góc phối cảnh:** Tự động xoay nghiêng chữ và thẻ số liệu 3D khớp theo phối cảnh không gian của ảnh chụp.
5. **13 kiểu chuyển cảnh điện ảnh:** Zoom in, Pan camera, Fly-through, Fade, Blur transition tạo cảm giác như video 3D render thực thụ.
6. **Xuất video MP4 chuẩn Full HD tại chỗ:** Sử dụng **WebCodecs API** kết hợp bộ thư viện **mp4-muxer** để render và xuất file video MP4 chất lượng cao trực tiếp trên RAM máy tính người dùng trong vài giây.
7. **Bảo mật dữ liệu tuyệt đối:** Dữ liệu dự án và hình ảnh chỉ lưu trên trình duyệt của người dùng thông qua IndexedDB nội bộ, không gửi bất kỳ ảnh nào lên máy chủ bên thứ ba.

---

## 📂 Cấu Trúc Mã Nguồn

```text
├── tool/                        # Ứng dụng lõi chạy trên trình duyệt
│   ├── index.html               # Giao diện Studio làm việc trực quan
│   ├── app.js                   # Logic điều khiển, quản lý timeline, layer và state
│   ├── render.js                # Bộ vẽ Canvas đa tầng phục vụ preview và xuất video
│   ├── audio.js                 # Xử lý âm thanh và nhạc nền
│   └── demo.json                # Dự án mẫu thiết lập sẵn 20 giây
├── demo-phoi-canh/              # Kho tư liệu mẫu, ảnh phối cảnh và video mẫu đã xuất
├── _test/                       # Dữ liệu thử nghiệm âm thanh, clip đồng hồ, logo
├── Mở Phối Cảnh Studio.bat       # Script khởi động nhanh 1 chạm cho Windows
├── FEATURES.md                  # Tài liệu chi tiết các tính năng kỹ thuật
└── README.md                    # Tài liệu hướng dẫn sử dụng và bàn giao
```

---

## 🖥️ Hướng Dẫn Chạy Cục Bộ Trên Máy Tính (Local Run)

### Cách 1: Khởi động 1 chạm bằng file `.bat` (Dành cho người không rành code)
1. Vào thư mục dự án `H:\test antigravity\map-video-app\`.
2. Bấm đúp chuột vào file **`Mở Phối Cảnh Studio.bat`**.
3. Cửa sổ dòng lệnh sẽ tự động khởi tạo local server và mở trình duyệt tại địa chỉ `http://127.0.0.1:5180/tool/`.

### Cách 2: Khởi chạy bằng dòng lệnh Python
```bash
# Di chuyển vào thư mục map-video-app
cd "H:\test antigravity\map-video-app"

# Chạy web server nội bộ bằng Python
python -m http.server 5180

# Mở trình duyệt truy cập:
http://127.0.0.1:5180/tool/
```

---

## 📋 Thông Tin Bàn Giao & Bản Quyền

* **Tác giả phát triển:** `huyhung-Martech` *(Hợp tác phát triển cùng Claude Code)*.
* **Mã nguồn GitHub:** [https://github.com/huyhung-Martech/phoi-canh-studio.git](https://github.com/huyhung-Martech/phoi-canh-studio.git)
* **Vị trí thư mục trên máy:** `H:\test antigravity\map-video-app\`
