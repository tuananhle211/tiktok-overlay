# Chánh Điện Tịnh Tâm

Chánh điện online 2.5D cho TikTok LIVE. Mỗi người xem bình luận là bước vào chánh điện, ngồi xuống bồ đoàn tụng kinh. Ai tặng quà sẽ được xướng tên hồi hướng bằng giọng đọc tiếng Việt. Có nhạc thiền, chuông, mõ và đọc kinh định kỳ.

Mã nguồn chia sẻ miễn phí (MIT). Có hai phần:

| Thư mục | Là gì |
|---|---|
| `index.html`, `assets/` | Bản web tĩnh cho mọi người tự vào ngồi tụng (đăng lên Cloudflare Pages) |
| `live/` | Bộ công cụ phát LIVE: server Node, overlay 9:16, bảng điều khiển |

## Chạy bộ LIVE trên máy phát

Cần Node.js 20 trở lên.

```bash
cd live
npm install
npm start
```

1. Mở `http://localhost:3000/live/control.html` (bảng điều khiển).
2. Bấm **Mở màn hình overlay 9:16**, rồi bấm **Bật âm thanh** một lần trong cửa sổ đó (trình duyệt chặn tự phát tiếng).
3. Trong TikTok LIVE Studio: *Add source → Window capture* → chọn cửa sổ overlay. Với OBS thì dùng *Browser source* trỏ tới `http://localhost:3000/live/man-hinh`, kích thước 1080×1920. Địa chỉ này luôn hiện chủ đề đang chạy.
4. Bật LIVE trên TikTok, nhập `@username` vào bảng điều khiển, bấm **Kết nối**.

Chưa live vẫn thử được: dùng **Thử tương tác**, **Đổ người mẫu 15/36/64/100** hoặc **Bot mô phỏng**.

### Nhiều chủ đề

| Chủ đề | Mã | Overlay |
|---|---|---|
| Chánh Điện Tịnh Tâm (chánh điện, bồ đoàn, tụng kinh) | `chua` | `/live/overlay.html` |
| Đêm Hoa Đăng (thả đèn trên sông đêm) | `hoadang` | `/live/hoadang.html` |
| Khu Tam Thái Tử (châm biếm ổ lừa đảo) | `luadao` | `/live/luadao.html` |
| Vườn Chống Zombie (game thủ thành) | `zombie` | `/live/zombie.html` |

- **Chuyển chủ đề ngay khi đang chạy**: ô **🎭 Chủ đề** ở đầu bảng điều khiển. Không cần khởi động lại server, kết nối TikTok vẫn giữ. Cửa sổ overlay tự mở trang của chủ đề mới; bấm **Bật âm thanh** lại một lần.
- **Server nhớ chủ đề dùng lần cuối** (file `live/chu-de.txt`). `npm start` mở lại đúng chủ đề đó; `npm run chua`, `npm run hoadang`, `npm run luadao`, `npm run zombie` chọn thẳng.
- **Một địa chỉ cho OBS / LIVE Studio**: `http://localhost:3000/live/man-hinh`, luôn hiện chủ đề đang chạy.
- Cài đặt của mỗi chủ đề được giữ riêng: chuyển đi rồi chuyển lại không mất (cho tới khi tắt server).
- Trên Windows, bấm đúp `start-live.bat` để mở cả server, bảng điều khiển và màn hình 9:16.

**Thêm chủ đề mới**: tạo `live/themes/<mã>.mjs` (xem chú thích đầu `themes/chua.mjs` để biết cần trả về gì) và một trang overlay trong `live/`. Server tự nhận file mới khi khởi động, bảng điều khiển tự có tên chủ đề trong danh sách.

### Người xem làm được gì (Chánh Điện)

- **Bình luận bất kỳ**: được vào ngồi (tối đa 100 chỗ, chỗ ngồi tự mở rộng 24 → 36 → 64 → 100). Đầy chỗ thì người im lặng lâu nhất mà chưa tặng quà sẽ nhường chỗ.
- **Bình luận đúng một từ** `nam`, `nữ`, `sư`, `ni`, `tiểu`, `bà`, `cao tăng`: đổi hình nhân vật. Câu "Nam mô A Di Đà Phật" không bị hiểu nhầm thành "nam".
- **Tặng quà**: banner xướng tên, giọng đọc hồi hướng (lấy lời nguyện từ bình luận gần nhất của người đó nếu có), hiệu ứng theo giá trị quà, cộng điểm vào bảng Công Đức.
- **Thả tim**: tim bay trên đầu nhân vật.

### Người xem làm được gì (Đêm Hoa Đăng)

- **Bình luận bất kỳ**: thả một chiếc đèn mang tên mình, lời bình luận hiện thành lời ước. Đèn trôi xa dần rồi tắt (mặc định 90 giây). Mỗi người một đèn trên sông: bình luận tiếp khi đèn còn trôi thì đèn sáng lên và đổi lời ước.
- **Bình luận đúng một từ** `đỏ`, `vàng`, `hồng`, `xanh`, `tím`, `cam` (hoặc "màu đỏ", "đèn đỏ"): đổi màu đèn. Phải có dấu, nên "tim" (thả tim) hay "hong" (không) không bị hiểu nhầm.
- **Tặng quà**: mỗi món quà thả một kiểu đèn riêng, ghi trong `live/qua-den.txt`. Mặc định: Rose → đèn hoa hồng, Finger Heart → đèn trái tim, Perfume → đèn hoa sen, Confetti → pháo hoa, Galaxy → đèn trời (các dòng khác như đèn ông sao, lồng Hội An, heo may mắn, đèn đôi, mưa đèn để sẵn dạng ghi chú, bỏ dấu `#` là dùng). Quà không có trong file: dưới 10 xu đèn giấy, 10–98 đèn hoa sen, từ 99 đèn trời. Giá càng cao đèn càng to, từ 99 xu cả dòng sông lóe sáng, tặng combo (×5…) thả thêm đèn nhỏ cùng kiểu. Có banner xướng tên, bảng **Đèn Sáng Nhất** và giọng đọc cảm ơn.
- **Thả tim**: đom đóm bay lên từ đèn của người đó.
- **Mỗi 5 phút** cả dòng sông sáng lên kèm một câu nhắc người mới cách thả đèn.

Cảnh sông, trăng, bờ phố và đèn đều vẽ bằng code, không cần file hình. Trên sông có tối đa 40 đèn (chỉnh được 10–80); tên chỉ hiện ở đèn gần và không bao giờ chồng lên nhau, tối đa 3 lời ước cùng lúc. Mở `hoadang.html?debug=1` để xem số khung hình mỗi giây.

### Người xem làm được gì (Khu Tam Thái Tử)

Chủ đề **châm biếm, giả tưởng**: một phòng làm việc của ổ lừa đảo. Tên lấy theo một khu có thật ở Bavet (sát cửa khẩu Mộc Bài), nơi báo chí đưa tin nhiều người Việt bị dụ sang bằng lời hứa việc nhẹ lương cao rồi bị ép làm việc. Vì vậy dòng phụ ghi "Giả tưởng · Châm biếm", các "gói lừa" đều là chuyện phi lý (Bán đất Mặt Trăng, NFT gà biết hát…), và buổi họp giao ban mặc định xen lời nhắc cảnh giác lừa đảo thật (tắt được trong cài đặt). Nội dung kiểu này dễ bị TikTok xem là cổ súy lừa đảo hoặc buôn người; cân nhắc trước khi phát và tự chịu trách nhiệm như ở mục Miễn trừ trách nhiệm.

- **Vào phòng live là vào ca**, không cần bình luận: tự ngồi vào một máy tính (tối đa 50 máy, chỉnh được 10–50). Kín chỗ thì người mới vào (hoặc người chưa có máy mà bình luận, tặng quà) thay chỗ người im lặng lâu nhất, người đó hiện "BỊ ĐUỔI!" rồi đi ra cửa. Bot và nhân viên mẫu luôn bị đuổi trước người thật.
- **Im lặng 3 phút** (chỉnh được): gục đầu ngủ gật, "z z z" bay lên. Quản giáo đi xuống tận bàn, đứng cạnh, cầm loa hét **"DẬY LÀM VIỆC!"**; người đó giật mình, hiện ❗ và **thẻ vàng**, camera zoom vào, loa đọc "Nhân viên X ngủ gật trong giờ làm!". Bình luận, tặng quà hoặc thả tim là tỉnh và mất thẻ vàng. Mỗi lần đánh thức cách nhau ít nhất 15 giây, người thật trước bot; loa không gọi tên bot.
- **Bình luận đúng một từ** `nam` / `nữ`: đổi kiểu tóc. Ai có ảnh đại diện TikTok thì mặt nhân vật là ảnh đó, đeo tai nghe tổng đài.
- **Tặng quà**: chốt một "gói" ghi trong `live/qua-goi.txt`. Mỗi xu = 1 triệu "đồng lừa được" trên bảng **Lừa được nhiều nhất** và thanh KPI trên màn hình trung tâm. Có loa thông báo (chuông + giọng đọc), camera zoom vào người tặng, tiền bay; từ 99 xu có pháo hoa và cả phòng giơ tay ăn mừng. Vượt KPI thì cả phòng ăn mừng và lên ca mới (KPI ×1,5).
- **Quà rẻ (mặc định Rose)**: ném gạch / dép vào quản giáo, combo ×5 ném 5 phát, mỗi phát 6–10 máu. Quản giáo hết máu thì gục, bị kéo ra ngoài, quản giáo khác lên thay. Máu quản giáo chỉnh được (mặc định 100).
- **Quản giáo** đi tuần trước cửa sổ, thỉnh thoảng quát; **họp giao ban** định kỳ (mặc định 4 phút) kèm loa.
- Bot vẫn có trên bảng xếp hạng nhưng tối đa 10 triệu (10 xu), không đẩy KPI quá phần đó.

Cảnh phòng, cửa sổ song sắt nhìn ra thị trấn casino (biển neon chung chung, tường bao dây thép gai, chòi gác có đèn pha), bàn máy và nhân vật đều vẽ bằng code.

### Người chơi làm được gì (Vườn Chống Zombie)

Game thủ thành dọc: zombie đi chậm từ trên xuống, hàng rào gỗ ở dưới, sau rào là khu vườn. Hình vẽ và luật chơi là thiết kế riêng, không lấy nhân vật hay hình ảnh của game nào.

- **Vào phòng live là được trồng một cây** (tối đa 30, chỉnh được 10–30), mặt cây là ảnh đại diện. Kín vườn thì người mới thay chỗ cây im lặng lâu nhất, bot và cây mẫu bị thay trước.
- **Nhấp liên tục vào màn hình live là bắn** (trên TikTok, nhấp màn hình chính là thả tim): cây bắn đạn vào zombie gần hàng rào nhất. Nhấp dồn dập thì đạn ít đi nhưng mạnh hơn, để màn hình không rối. Trên overlay có 3 ô hướng dẫn to: nhấp màn hình = bắn, gõ 1 · 2 · 3 = đổi đạn, follow = đại bác.
- **Bình luận `1`, `2`, `3`** đổi loại đạn, màu cánh hoa đổi theo: 1 xanh lá (sát thương thường), 2 băng (làm zombie chậm 2 giây), 3 lửa (nổ lan ra zombie bên cạnh).
- **Follow** bắn một quả đại bác vào chỗ zombie đông nhất.
- **Tặng quà** (file `live/qua-zombie.txt`): nâng cấp súng (tối đa cấp 5, hiện bằng ★; mỗi cấp đạn mạnh thêm 12%, cấp 5 là ×1,5, các quà khác của người đó mạnh thêm 10% mỗi cấp; mỗi cấp cây to thêm và có hào quang: cấp 2 sáng xanh lá, cấp 3 tia xanh dương, cấp 4 tia tím và đốm sáng bay quanh, cấp 5 tia vàng kép, vòng sáng dưới gốc và lấp lánh bay lên); **mưa đạn**: 3 giây đạn rơi từ trời xuống mọi zombie trên màn hình (tối đa 20 con); **pháo kích**: 3 quả đạn pháo lớn vào 3 cụm đông nhất, hất zombie lùi lại; **ụ súng liên thanh**: một ụ súng mọc lên trên hàng rào, tự bắn liên tục 25 giây (combo cộng thêm thời gian, thanh thời gian giảm dần trên đầu ụ, chỉ chạy khi có zombie nên hết màn thì để dành sang màn sau, tối đa 4 ụ cùng lúc), tổng sát thương lớn hơn cả ba quà rẻ hơn và ưu tiên bắn boss; **bom hạt nhân** quét sạch zombie trên màn hình (boss chỉ mất nửa máu). Sát thương của quà tăng theo màn và số người chơi giống như máu zombie, nên phòng đông quà vẫn mạnh như lúc vắng. Quà không có trong file: dưới 10 xu nâng cấp, 10–98 đại bác, từ 99 bom hạt nhân.
- **Màn chơi**: thanh tiến độ đếm số zombie đã hạ. Hạ hết thì qua màn, sang màn sau zombie nhiều hơn, khỏe hơn. Zombie kéo tới từng tốp 1–3 con, giữa màn có một **đàn zombie** 6–12 con tràn vào cùng lúc. **Hàng rào vỡ thì cả vườn chơi lại từ màn 1** (bảng xếp hạng vẫn giữ). Càng nhiều người chơi, zombie càng đông và càng nhiều máu. **Cuối mỗi màn có một boss** to gấp đôi, máu rất trâu (có thanh máu riêng trên màn hình), cứ 7 giây gầm lên gọi thêm 2 zombie; màn 5, 10, 15… boss càng khỏe hơn nữa. Boss mà chạm rào là rào gần như vỡ. Người đầu tiên vào thì có 5 giây chuẩn bị để mọi người kịp vào.
- **Các loại zombie** (xuất hiện dần theo màn): thây ma thường; zombie chạy nhanh; **zombie đội nồi** (màn 2, nồi sắt đỡ nửa sát thương cho đến khi bị bắn vỡ ở nửa máu); **dơi zombie** (màn 3, bay lượn qua lại, nhanh nhưng yếu); **zombie đô con** (màn 3, máu dày); **zombie nhảy** (màn 4, thỉnh thoảng nhảy vọt lên phía trước); **zombie bụng phệ** (màn 4, chết thì vỡ ra 3 zombie tí hon chạy nhanh); **pháp sư zombie** (màn 5, cứ 3 giây hồi máu cho zombie xung quanh, nên hạ trước).
- **Bảng xếp hạng**: Sát thương và Tiêu diệt, chỉ tính người thật; bot và cây mẫu vẫn bắn nhưng không bao giờ lên bảng.
- **Người đã thoát**: TikTok không báo khi ai rời live, nên cây nào 3 phút không được nhấp, bình luận hay tặng quà thì **héo** (rũ xuống, ngả nâu, 💤); thêm 2 phút nữa thì **bị nhổ khỏi vườn**, nhường chỗ. Nhấp một cái là cây tươi lại. Hai mốc thời gian chỉnh được; cây mẫu không bị héo.

### Quà nào thả đèn nào

Sửa `live/qua-den.txt`, mỗi dòng `tên quà, tên quà khác = kiểu đèn`, lưu là có hiệu lực sau vài giây. Kiểu đèn: `den-giay`, `hoa-sen`, `den-troi`, `hoa-hong`, `trai-tim`, `ong-sao`, `long-tron`, `con-heo`, `den-doi`, `phao-hoa`, `mua-den`. Tên quà phải đúng như TikTok gửi về: khi có người tặng thật, Nhật ký ghi `🎁 <người> tặng <tên quà> x1 (mã …, … xu)`, chép tên (hoặc `#mã`) vào file. Dòng viết sai được báo trong Nhật ký kèm số dòng. Nút **Tặng thử** trong bảng điều khiển liệt kê đúng các quà trong file.

Chủ đề Khu Tam Thái Tử dùng file riêng `live/qua-goi.txt` cùng cách viết; kiểu: `nem-gach`, `hoang-tu`, `nft-ga`, `khoa-hoc`, `meo-coin`, `dat-mat-trang`. Vườn Chống Zombie dùng `live/qua-zombie.txt`; kiểu: `nang-cap`, `mua-dan`, `dai-bac`, `u-sung`, `hat-nhan`.

Bảng **Tặng quà · Thả đèn** bên trái overlay hiện cùng lúc mọi dòng của file: icon quà TikTok → icon đèn và tên đèn; banner tặng quà cũng dùng icon thay cho tên quà. Icon lấy từ danh sách quà công khai của TikTok (không cần tài khoản), server tự tải khi chạy, lưu 3 ngày trong `live/gift-icons/` (thư mục này không đưa lên git vì là hình của TikTok). Máy không có mạng thì bảng hiện tên quà thay cho icon.

### Lọc chữ

Bật mặc định cho mọi chủ đề. Link, số điện thoại và các từ trong `live/tu-cam.txt` (mỗi dòng một từ) hiện thành `***` trong tên và bình luận. Sửa file rồi lưu là có hiệu lực sau vài giây, không cần khởi động lại.

### Giọng đọc

Dịch vụ đọc của Microsoft Edge hay từ chối giữa chừng, nên mỗi câu được thử tối đa 3 lần. Vẫn lỗi thì câu đó bị bỏ, ghi một dòng "TTS lỗi" trong Nhật ký; banner chữ trên màn hình vẫn hiện đầy đủ.

## Bảo mật

Dự án được viết để ai tải về chạy cũng an toàn mặc định:

- **Không dùng tài khoản TikTok.** Server chỉ đọc sự kiện công khai của phòng live theo username. Không cần, không hỏi và không lưu mật khẩu, cookie hay session. Không gửi tin nhắn thay bạn.
- **Chỉ mở trên máy mình.** Server lắng nghe `127.0.0.1`, máy khác trong mạng hay Internet không truy cập được. Muốn mở ra ngoài phải tự đặt biến `HOST`. Không nên làm vậy khi chưa thêm đăng nhập.
- **Chặn trang web lạ điều khiển.** WebSocket chỉ nhận kết nối từ chính trang của server (kiểm tra `Origin`), và header `Host` phải là localhost (chống DNS rebinding). Một trang web khác đang mở trong cùng trình duyệt không gửi được lệnh. Cửa sổ overlay chỉ nhận dữ liệu, không gửi lệnh được.
- **File tĩnh có danh sách trắng.** Chỉ phục vụ `/assets` và `/live`. Chặn file ẩn (`.git`, `.env`), `node_modules`, mã server và file chủ đề (`.mjs`), `package.json`, danh sách từ cấm (`.txt`) và mọi đường dẫn `../`.
- **Không tin dữ liệu vào.** Tên người xem, bình luận và tên quà đều bị cắt độ dài. Cài đặt chỉ nhận đúng khóa, đúng kiểu, trong giới hạn. Văn bản đưa vào giọng đọc được escape XML. Mọi chữ trên màn hình vẽ bằng `textContent` hoặc canvas, không chèn HTML, nên bình luận chứa mã độc chỉ hiện ra như chữ thường.
- **Chống spam.** Hàng đợi giọng đọc tối đa 15 câu. Bình luận thường không đọc thành tiếng.
- **Phụ thuộc ghim phiên bản** trong `live/package.json`: `ws`, `msedge-tts`, `tiktok-live-connector`. Không có khóa API nào trong mã.

Các lớp trên đã được thử: đường dẫn `../`, `%2e%2e`, `.git/config`, `server.mjs`, `package.json` đều trả 404. Host giả trả 421. WebSocket từ Origin lạ bị từ chối. Lệnh gửi từ overlay bị bỏ qua. Cài đặt sai kiểu bị kẹp về giới hạn.

### Lưu ý

- `tiktok-live-connector` là thư viện cộng đồng, không phải API chính thức của TikTok. Nó có thể ngừng chạy khi TikTok đổi hệ thống. Kiểm tra điều khoản TikTok trước khi dùng cho kênh của bạn.
- Giọng đọc dùng dịch vụ Read Aloud của Microsoft Edge qua mạng (giọng Nam Minh, Hoài My). Máy phát cần có Internet.
- Hình ảnh trong `assets/` được tạo bằng Google Flow, nhạc nền tạo bằng Gemini. Kiểm tra điều khoản của các dịch vụ đó trước khi dùng thương mại, hoặc thay bằng tài nguyên của bạn.

## Miễn trừ trách nhiệm

Dự án được chia sẻ **miễn phí, với mục đích học tập và tham khảo lập trình**. Phần mềm được cung cấp "nguyên trạng" (AS IS), không kèm bất kỳ bảo đảm nào, rõ ràng hay ngụ ý.

Khi tải về, sử dụng, chỉnh sửa hoặc phân phối lại mã nguồn này, **bạn tự chịu hoàn toàn trách nhiệm** về:

- Mọi nội dung bạn phát trên livestream hoặc đăng tải, bao gồm hình ảnh, âm thanh, giọng đọc, lời nguyện, bình luận được hiển thị.
- Việc nhận quà, donation hoặc bất kỳ khoản thu nào từ người xem.
- Việc tuân thủ điều khoản sử dụng của TikTok và các nền tảng, dịch vụ bên thứ ba khác (thư viện đọc sự kiện TikTok là thư viện cộng đồng, không chính thức).
- Việc tuân thủ pháp luật nơi bạn sinh sống và hoạt động, kể cả quy định về hoạt động tôn giáo, quảng cáo, thuế và bản quyền.
- Mọi rủi ro và thiệt hại phát sinh, trực tiếp hay gián tiếp, như bị khóa tài khoản, bị dừng live, mất dữ liệu, tranh chấp hay khiếu nại.

Tác giả **không liên quan, không bảo trợ và không chịu trách nhiệm** đối với bất kỳ kênh, tài khoản, sản phẩm hay hoạt động nào sử dụng mã nguồn này. Dự án không đại diện cho bất kỳ chùa, tu viện hay tổ chức tôn giáo nào. Khi dùng nội dung liên quan đến Phật giáo, xin giữ sự tôn kính và không dùng vào mục đích lừa đảo, trục lợi hay xúc phạm niềm tin của người khác.

Việc sử dụng mã nguồn đồng nghĩa với việc bạn đã đọc và đồng ý với các điều trên.

> **Disclaimer (EN):** This project is shared free of charge for educational purposes only and is provided "AS IS", without warranty of any kind. Anyone who uses, modifies or redistributes it is solely responsible for their own content, streams, donations, compliance with TikTok and other platforms' terms, and applicable laws. The author is not affiliated with, does not endorse, and accepts no liability for any channel, account, product or activity built with this code, nor for any direct or indirect damages.

## Ủng hộ tác giả

Dự án chia sẻ miễn phí. Nếu thấy hữu ích và muốn góp chút công đức để tác giả duy trì và làm thêm tính năng, bạn có thể chuyển khoản:

| | |
|---|---|
| Ngân hàng | **MB Bank** |
| Số tài khoản | **999979798886** |
| Chủ tài khoản | **HUYNH HUU NHAN** |

![QR chuyển khoản MB Bank](https://img.vietqr.io/image/MB-999979798886-compact2.png?accountName=HUYNH%20HUU%20NHAN&addInfo=Ung%20ho%20Chanh%20Dien%20Online)

Xin cảm ơn và chúc bạn thân tâm an lạc. Nam mô A Di Đà Phật.

## Giấy phép

MIT, xem `LICENSE`.
