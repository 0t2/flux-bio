# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.6 - 2026-11-20

### Bảo mật
- Liên kết xem trước của bản nháp không còn hiển thị địa chỉ của liên kết có mật khẩu hoặc đã ẩn địa chỉ. Nút như vậy ở đó cũng đi qua liên kết rút gọn, giống như trên trang đã xuất bản. [#54](https://github.com/0t2/flux-bio/pull/54)
- Mật khẩu của một liên kết cho phép nhập sai mười lần trong 15 phút, sau đó không nhận nữa cho đến khi hết thời gian đó. Trước đây không có giới hạn. [#54](https://github.com/0t2/flux-bio/pull/54)
- Một địa chỉ không tồn tại không còn tốn kém hơn khi nó dài hơn. Việc tìm địa chỉ gần giống có thể mất gấp nhiều lần giới hạn thời gian của một yêu cầu trên trang web lớn, và ai cũng có thể gửi những địa chỉ như vậy. [#54](https://github.com/0t2/flux-bio/pull/54)

### Đã sửa
- Một liên kết rút gọn đã lưu trữ, một trang đã xóa hoặc địa chỉ cũ của một trang có thể xuất hiện lại và tồn tại mãi nếu có người truy cập đúng vào lúc thay đổi. [#54](https://github.com/0t2/flux-bio/pull/54)
- Khôi phục bản sao lưu không còn để một liên kết mà bản sao lưu đã lưu trữ tiếp tục chuyển hướng. [#54](https://github.com/0t2/flux-bio/pull/54)
- Một cài đặt được lưu trong lúc thứ khác đang được lưu sẽ được giữ lại, và một thay đổi đã vào cơ sở dữ liệu nhưng chưa đến với khách truy cập sẽ được gửi đến họ khi bạn thực hiện lại. [#54](https://github.com/0t2/flux-bio/pull/54)
- Hai mục có cùng id trên một trang sẽ bị từ chối khi xuất bản: liên kết rút gọn của một trong hai mục sẽ không hoạt động. [#54](https://github.com/0t2/flux-bio/pull/54)

## 0.4.5 - 2026-11-20

### Đã sửa
- Hướng dẫn do trang thử nghiệm hoặc bản chạy trên máy cung cấp không còn đưa ra các lệnh của trang chính thức: lệnh triển khai của nó có `--mode staging`, và nó không còn bảo AI của bạn lưu hướng dẫn đó làm skill của trang chính thức. [#52](https://github.com/0t2/flux-bio/pull/52)
- Với một Worker có nhiều trang web, mục “Gỡ bỏ FluxBio” trong hướng dẫn không còn khiến AI của bạn xóa cả Worker và cơ sở dữ liệu của trang đầu tiên chỉ để gỡ một trang. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy` giờ dựa vào phiên bản Worker đang thực sự chạy, vốn không phải lúc nào cũng là bản mới nhất sau khi khôi phục phiên bản cũ trong bảng điều khiển Cloudflare. `pnpm deploy:images` đọc hình ảnh của trang thứ hai bằng token của chính trang đó, và `pnpm reset-password --mode staging` không còn đụng đến token của trang chính thức đã lưu. [#52](https://github.com/0t2/flux-bio/pull/52)
- Chạy trang thử nghiệm trên máy tính của bạn (`cf dev --mode staging`) không còn cần đăng nhập Cloudflare. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update` trả lời là không biết (`latest` là null) khi gặp phiên bản hoặc nhật ký thay đổi mà nó không xác định được, thay vì báo là đã mới nhất. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### Đã sửa
- `pnpm reset-password` giờ kiểm tra rằng địa chỉ bạn đưa ra đúng là do Worker mà thư mục của bạn triển khai phục vụ rồi mới thay đổi. Trước đây, khi chạy với địa chỉ của trang thử nghiệm hoặc trang chạy trên máy, đúng như trang đăng nhập của chúng hiển thị, lệnh này thay mật khẩu của trang chính thức. Lệnh cũng lấy danh sách trang web từ Worker đang chạy, lưu mật khẩu trước khi đặt, và cho biết trang nào chưa có token. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy` xem tất cả Worker trong tài khoản trước khi tạo trang mới: trước đây chỉ thấy mười Worker đầu, nên một FluxBio nằm phía sau trong danh sách bị bỏ sót. Lệnh cũng dừng lại khi không đọc được một Worker, và không còn tạo trang thử nghiệm cho một trang chính thức không tồn tại. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code` không còn ghi đè tệp của riêng bạn khi bản phát hành mới bắt đầu dùng cùng tên, không còn làm mất tệp chỉ đổi chữ hoa chữ thường, và không còn dừng giữa chừng khi một tệp trở thành thư mục. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json` nhận mọi tên Worker mà Cloudflare chấp nhận: có thể có dấu gạch dưới và dài tối đa 63 ký tự. [#51](https://github.com/0t2/flux-bio/pull/51)

## 0.4.3 - 2026-11-20

### Mới
- `pnpm update:code` đưa mã trong thư mục FluxBio của bạn lên bản phát hành mới nhất. Lệnh cho biết bản cập nhật mang lại gì, dừng lại nếu có tệp của FluxBio đã bị sửa trong thư mục, và không đụng đến các tệp của riêng bạn. Việc triển khai vẫn là một bước riêng. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### Mới
- Phần câu hỏi thường gặp trên fluxbio.link và hướng dẫn của trang web giờ trả lời câu “Làm sao để nhận phiên bản mới?”: hỏi AI của bạn, xem trang Cài đặt trong bảng điều khiển, hoặc theo dõi các bản phát hành của dự án trên GitHub để nhận email mỗi khi có bản mới. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### Mới
- Trang Cài đặt trong bảng điều khiển cho bạn biết khi có bản FluxBio mới hơn, báo trước nếu bản đó có sửa lỗi bảo mật, và đưa ra câu để nói với AI của bạn khi muốn cập nhật. Trang chỉ hỏi GitHub khi bạn mở nó, và khi trang web của bạn đã là bản mới nhất thì điều đó được ghi cạnh số phiên bản ở cuối trang. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### Cần thực hiện
- Nếu bạn đã sửa `cloudflare.config.ts` (đổi `WORKER_NAME`, thêm tên miền riêng hoặc bỏ `ANALYTICS`), hãy ghi các thiết lập đó vào `worker.json` trong thư mục FluxBio của bạn trước khi triển khai phiên bản này, ví dụ `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. Tệp này không thuộc mã nguồn, nên từ nay các bản cập nhật sẽ không đụng đến nó. Nếu bạn quên, việc triển khai sẽ dừng lại và cho biết tên cần ghi. [#45](https://github.com/0t2/flux-bio/pull/45)

### Mới
- `pnpm run deploy` hỏi Cloudflare xem đang chạy gì trước khi tải lên, và dừng một lần triển khai sẽ tạo thêm một trang web trống, làm một trang web của bạn ngừng hoạt động, ghi đè một Worker khác hoặc thay mật khẩu của bạn. Hãy dùng lệnh này thay cho `cf deploy`. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password` đặt mật khẩu quản trị mới và tạo API token mới cho từng trang web của bạn mà không hiển thị cả hai. Mục “Quên mật khẩu?” trên trang đăng nhập giờ đưa ra lệnh này. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### Mới
- Nếu thư mục bạn dùng để triển khai không còn nữa, do đã bị xóa hoặc nằm ở một máy tính khác, AI của bạn có thể dựng lại nó: hướng dẫn của trang web có các bước tại `/api/guide/rebuild`, kèm tên Worker của bạn. Trong lúc đó trang web của bạn vẫn hoạt động, và không có gì trên đó bị mất. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### Mới
- `GET /api/update` cho biết có bản FluxBio mới hơn hay không: trang web của bạn chậm bao nhiêu bản phát hành, và trong đó có bản nào sửa lỗi bảo mật hoặc có mục “Cần thực hiện” hay không. Nhật ký thay đổi này chỉ được đọc từ GitHub khi có yêu cầu. AI của bạn hỏi một lần mỗi cuộc trò chuyện và báo cho bạn trước tiên khi có bản sửa lỗi bảo mật đang chờ. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### Mới
- Mỗi bản phát hành giờ đã có số phiên bản. Trang web cho biết phiên bản đang chạy trong `version` của `GET /api/state` và ở đầu `/llms.txt`, và mỗi tiêu đề trên trang này là một phiên bản. Con số cho biết việc cập nhật cần gì: khi số ở giữa thay đổi (0.3.4 lên 0.4.0) thì có mục “Cần thực hiện”, còn khi chỉ số cuối thay đổi thì chỉ cần triển khai lại. Trang web vẫn hiện 0.2.1 là từ trước bản phát hành này, nên hãy dựa vào ngày cập nhật gần nhất của trang. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### Mới
- Nhật ký thay đổi này, tại đây và tại [fluxbio.link](https://fluxbio.link/en/changelog/).

## 2026-11-11

### Cần thực hiện
- Cập nhật và triển khai lại để nhận bản sửa lỗi liên kết mật khẩu bên dưới. Không có gì khác về những thay đổi trang web của bạn. [#38](https://github.com/0t2/flux-bio/pull/38)

### Bảo mật
- Mật khẩu trên liên kết của trang có thể bị bỏ qua: địa chỉ `/_c/<handle>/<id>/link` của trang được trả lời bằng địa chỉ thực của liên kết. Liên kết có nút đi qua liên kết ngắn của nó (mật khẩu, địa chỉ ẩn, địa chỉ thiết bị, thẻ UTM) không còn được phân phát hoặc tính ở đó nữa. [#38](https://github.com/0t2/flux-bio/pull/38)

### Đã sửa
- Mật khẩu liên kết phù hợp không bao giờ đến đích trong Chrome. [#38](https://github.com/0t2/flux-bio/pull/38)
- Việc xuất bản không còn làm mất nội dung đã nhập sau khi nhấp chuột và việc lưu tự động trong khi xuất bản không còn bị từ chối nữa. [#38](https://github.com/0t2/flux-bio/pull/38)
- Mỗi công tắc cài đặt trong bảng thông tin chỉ gửi những gì nó thay đổi. Trước đây, việc chuyển đổi có thể hoàn tác những gì AI của chủ sở hữu đã đặt kể từ đó, bao gồm cả miền và múi giờ. [#38](https://github.com/0t2/flux-bio/pull/38)
- Việc xóa một trang web có thể khiến cơ sở dữ liệu không có bảng khi KV từ chối xóa và vượt quá 5.000 khóa KV, nó dừng lại và cho biết đã hoàn tất. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### Đã thay đổi
- Công tắc cài đặt chỉ được đặt tên là Liên kết ngắn và bật có nghĩa là các trang tiểu sử bị tắt. Nó được đặt tên theo các trang tiểu sử nhưng mô tả tác dụng của việc tắt nó, vì vậy chủ sở hữu của một trang web chỉ có các liên kết ngắn sẽ đọc ngược lại. [#37](https://github.com/0t2/flux-bio/pull/37)

### Đã sửa
- `pnpm dev` không khởi động được vì `cloudflare.config.ts` đã nhập một mô-đun mà Công nhân cũng nhập. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### Cần thực hiện
- Nếu bạn gửi ảnh của mình dưới dạng tệp tĩnh với `pnpm deploy:images`, hãy triển khai phiên bản này rồi chạy lại: giờ đây nó đọc ảnh của từng trang web thông qua `GET /api/media/{id}` mới và xây dựng lại gói từ chúng. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### Bảo mật
- Việc kiểm tra miền tùy chỉnh được liên kết với tên máy chủ mà nó được hỏi, do đó, việc kiểm tra đã trả lời cho một tên máy chủ này không thể được chuyển cho một tên máy chủ khác. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- Trên một Worker chứa nhiều hơn một trang web, ảnh của mỗi trang web được gửi dưới dạng tệp tĩnh hiện nằm trong một thư mục của trang web đó và một trang web chỉ được phục vụ ở mức `/media/<id>`. Trước đây, tất cả các trang web đều chia sẻ một thư mục. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Mới
- `GET /api/media/{id}` cung cấp các byte hiện tại của hình ảnh cho mã thông báo, để sao lưu và cho `pnpm deploy:images`. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### Đã thay đổi
- `pnpm deploy:images` tải xuống mọi hình ảnh trong mỗi lần chạy, vì quá trình tải lên hoặc khôi phục có thể ghi đè id và kiểm tra trang web nào và chế độ nào nó đang đọc trước khi tải xuống. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- Hướng dẫn mà AI của chủ sở hữu đọc sao lưu với `GET /api/media/{id}` vào thư mục ảnh chụp nhanh mà nó không bao giờ ghi đè và thiết lập trang đầu tiên theo thứ tự xác định. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### Cần thực hiện
- Nếu cơ sở dữ liệu của bạn được mở lần cuối bởi một bản dựng từ trước `7b0bad4` của ngày này, trước tiên hãy triển khai bản dựng ngay trước khi có sự cố bí (`8d0c435`) và mở trang web một lần, sau đó triển khai bản dựng này. Các quá trình di chuyển được gộp thành một và cơ sở dữ liệu chạy ít hơn mười cơ sở dữ liệu cũ (`SELECT value FROM _meta WHERE key = 'schema_version'` dưới 10) hiện được coi là cập nhật, do đó, nó sẽ thiếu các cột và chỉ mục. Các lượt cài đặt và cơ sở dữ liệu mới ở mức 10 không bị ảnh hưởng. [#27](https://github.com/0t2/flux-bio/pull/27)
- Sử dụng pnpm 10.34.5 hoặc mới hơn để cài đặt. Dự án hiện đặt tên pnpm 12.18.0 trong `package.json` và pnpm cũ hơn dừng lại với "Không thể chuyển pnpm". Trình cài đặt trong `AGENTS.md` thay thế nó và các bước của nó đã thay đổi (`pnpm runtime set node 24 --global`, `bin` trong thư mục pnpm). cài đặt của pnpm hiện ở dạng `pnpm-workspace.yaml`. [#19](https://github.com/0t2/flux-bio/pull/19)

### Bảo mật
- Các trang chứa liên kết chỉ tải hình ảnh từ chính trang web đó (cộng với hình thu nhỏ YouTube trên trang có video), nơi chúng được tải từ bất kỳ địa chỉ https nào. [#32](https://github.com/0t2/flux-bio/pull/32)
- CSS của chính trang đó được đọc khi trình duyệt đọc nó trước khi nó được chấp nhận và chỉ có thể tải hình ảnh của chính trang đó. [#32](https://github.com/0t2/flux-bio/pull/32)

### Mới
- Một số trang web trong một Công nhân, mỗi trang web có cơ sở dữ liệu, KV, số liệu thống kê, cài đặt và miền riêng, được liệt kê trong `sites.json`. Nếu không có tệp đó thì Công nhân sẽ là một trang web như trước đây. [#23](https://github.com/0t2/flux-bio/pull/23)
- Nhúng các khối để mở bảng điều khiển của Ko-fi hoặc Calendly trên trang chỉ bằng một lần nhấn và nút nổi cho cả hai. Không có gì tải từ chúng trước khi nhấn. [#28](https://github.com/0t2/flux-bio/pull/28)
- AI của chủ sở hữu có thể cung cấp CSS cho trang liên kết của riêng nó (`appearance.css`), vì vậy "làm cho trang của tôi trông giống như hình ảnh này" sẽ giữ nguyên trang liên kết. [#32](https://github.com/0t2/flux-bio/pull/32)
- Nền trang có thể lặp lại ở kích thước đã đặt, đối với các mẫu (`appearance.bgTile`). [#29](https://github.com/0t2/flux-bio/pull/29)
- Các biểu tượng xã hội có thể đi sau các liên kết (`appearance.socialPlace`) và tên có thể bị ẩn nhưng được giữ làm tiêu đề của trang (`appearance.showName`). [#33](https://github.com/0t2/flux-bio/pull/33)
- Những hình ảnh không có tác dụng gì có thể được liệt kê và xóa: `GET` và `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- Cài đặt hiển thị gói, kích thước của cơ sở dữ liệu và ngày sử dụng hạn ngạch miễn phí và `pnpm usage` đọc nó từ tài khoản. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- Số liệu thống kê hàng ngày được lưu giữ trong 13 tháng, sau đó được hợp nhất thành một hàng mỗi tháng và mỗi số liệu có thể được tải xuống dưới dạng CSV. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images` gửi ảnh của trang web dưới dạng tệp tĩnh, không mất yêu cầu của Công nhân hoặc đọc KV. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- Một biểu mẫu vấn đề để yêu cầu một khối mới. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link có công cụ ước tính lưu lượng truy cập và chi phí. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### Đã thay đổi
- Không có giới hạn về số trang hoặc liên kết ngắn: không có gì mà khách truy cập hoặc chủ sở hữu chờ đợi để đọc toàn bộ bảng và trang tổng quan sẽ tải từng liên kết ngắn một màn hình. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- Chạy rẻ hơn: một lượt xem trang cần một lần đọc KV, các truy vấn D1 không phụ thuộc vào nhau đi cùng nhau, bảng thông tin yêu cầu Worker ít hơn và một lượt xem trang chiếm khoảng một phần ba CPU. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- Các trang và bản xem trước của trang tổng quan yêu cầu Google cung cấp phông chữ tiếng Trung chỉ với các ký tự mà chúng hiển thị chứ không phải toàn bộ phông chữ. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- Mã đọc dữ liệu được lưu trong các hình dạng cũ hơn đã không còn: cài đặt và hình dạng trang cũ, tệp sao lưu cũ, `ADMIN_TOKEN`, trang `/shorten` và địa chỉ trang tổng quan cũ. [#27](https://github.com/0t2/flux-bio/pull/27)
- Lời nhắc cài đặt FluxBio sẽ tải mã xuống trước và yêu cầu tác nhân đọc `AGENTS.md` từ thư mục, bằng tất cả 13 ngôn ngữ. [#21](https://github.com/0t2/flux-bio/pull/21)
- Hướng dẫn mà AI của chủ sở hữu đọc được chia thành một hướng dẫn chính ngắn và các chủ đề được đọc khi cần, đồng thời cho biết cách mỗi chủ đề tô màu các nút, cách tải phông chữ và cách tạo mẫu. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- Việc triển khai từ GitHub Actions của trang FluxBio chỉ xảy ra trong kho lưu trữ này và chỉ khi nó đặt tên cho một trang web. Một bản sao không triển khai được gì. [#14](https://github.com/0t2/flux-bio/pull/14)

### Đã sửa
- Việc lưu miền tùy chỉnh không thành công với 522 cho mọi miền cần xác nhận. [#35](https://github.com/0t2/flux-bio/pull/35)
- Một trang được xuất bản trước khi tồn tại `appearance.css` đã trả lời 500 cho đến khi nó được xuất bản lại. [#32](https://github.com/0t2/flux-bio/pull/32)
- Trang tổng quan không còn hiển thị vi phạm CSP trong bảng điều khiển trình duyệt trong mỗi lần tải. [#20](https://github.com/0t2/flux-bio/pull/20)
- Các bản sửa lỗi để AI xây dựng lại một trang từ ảnh chụp màn hình: bộ chọn thuộc tính CSS trên địa chỉ, `null` cho ảnh bìa và ảnh nền trong `POST /api/themes` và tên chủ đề bằng ngôn ngữ của chủ sở hữu từ `GET /api/themes/community?lang=`. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### Mới
- Bản phát hành công khai đầu tiên: Liên kết trong tiểu sử, liên kết ngắn và theo dõi nhấp chuột trên một Cloudflare Worker, do AI của chủ sở hữu điều hành. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

