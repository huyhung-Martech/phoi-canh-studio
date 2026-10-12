# Phối Cảnh Studio

Dựng video giới thiệu dự án bất động sản từ ảnh phối cảnh, ngay trên trình duyệt: ghim vị trí, tuyến đường phát sáng, nhãn tiện ích, tô khối căn hộ, thẻ thông số, chữ nằm theo phối cảnh, 13 kiểu chuyển cảnh, xuất MP4.

**Dùng online:** https://huyhung-martech.github.io/phoi-canh-studio/ (Chrome hoặc Edge bản mới)

**Chạy trên máy:** bấm đúp `Mở Phối Cảnh Studio.bat` (cần Python), hoặc chạy `py -m http.server 5180` trong thư mục này rồi mở http://127.0.0.1:5180/tool/

Dự án và ảnh của người dùng chỉ lưu trong trình duyệt của họ (IndexedDB), không gửi lên máy chủ nào. Muốn chuyển máy thì dùng nút **Lưu tệp** / **Mở tệp**.

## Cấu trúc

- `tool/index.html`: giao diện
- `tool/app.js`: thao tác chỉnh sửa, lưu, xuất MP4 (WebCodecs + [mp4-muxer](https://github.com/Vanilagy/mp4-muxer))
- `tool/render.js`: bộ vẽ Canvas dùng chung cho xem trước và xuất video
- `tool/demo.json` + `demo-phoi-canh/nen*.jpg`: dự án mẫu 20 giây
