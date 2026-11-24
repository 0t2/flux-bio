# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, `pnpm update:code` in your FluxBio folder brings its code to the newest release and shows the releases in between: read them before you deploy. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

## 0.4.11 - 2026-11-24

### 보안
- 관리자 비밀번호를 틀린 횟수를 이제 로그인 양식과 API bearer token 모두에서 방문자별로 셉니다. 15분 안에 열 번 틀리면 그 방문자는 시간이 지날 때까지 `429` `rate-limited`를 받고, 다른 사람은 잠기지 않습니다. 비밀번호를 바꾸면 횟수는 0에서 다시 시작합니다. [#60](https://github.com/0t2/flux-bio/pull/60)
- 업로드한 이미지는 이제 내용을 확인합니다. PNG, JPEG, WebP, GIF, AVIF 이미지가 아닌 파일은 어떤 형식이라고 보내든 `415`로 거부되고, 이미지는 실제 형식대로 저장됩니다. [#60](https://github.com/0t2/flux-bio/pull/60)
- `POST /api/themes/fetch`는 더 이상 리디렉션을 따라가지 않으며, 테마 파일을 최대 512 KB까지만 읽습니다. [#60](https://github.com/0t2/flux-bio/pull/60)

### 변경
- 상세 통계를 1분 동안 기억하므로 페이지와 기간을 오가도 다시 조회하지 않습니다. 숫자는 최대 1분 늦을 수 있습니다. [#60](https://github.com/0t2/flux-bio/pull/60)

### 수정
- 저장하지 못한 초안은 자동으로 다시 보내고, 연결이 돌아왔을 때도 다시 보냅니다. 편집기에 다시 시도 버튼도 생겼습니다. [#60](https://github.com/0t2/flux-bio/pull/60)
- 대시보드 화면을 그리다 오류가 나도 창이 하얗게 비지 않습니다. 오류를 알리고 새로 고침 버튼을 보여 줍니다. [#60](https://github.com/0t2/flux-bio/pull/60)
- 대시보드 언어를 바꿔도 열려 있던 내용이 그대로 남고, 전체를 다시 불러오지도 않습니다. [#60](https://github.com/0t2/flux-bio/pull/60)
- 세션이 끝난 뒤 다시 로그인하면 열려 있던 화면으로 돌아갑니다. [#60](https://github.com/0t2/flux-bio/pull/60)
- 한 페이지를 불러오다 생긴 오류가 다른 페이지로 바꾼 뒤에도 화면에 남아 있지 않습니다. [#60](https://github.com/0t2/flux-bio/pull/60)

## 0.4.10 - 2026-11-20

### 변경
- 링크 비밀번호를 틀린 횟수를 이제 방문자별로 셉니다. 15분 안에 열 번 틀리면 틀린 사람만 잠기고 다른 사람은 영향을 받지 않습니다. 링크 자체에도 모든 사람을 합쳐 50번이라는 한도가 있습니다. 방문자는 주소와 매일 바뀌는 솔트로 만든 네 글자로 구분하며, 주소 자체는 저장하지 않습니다. [#59](https://github.com/0t2/flux-bio/pull/59)

## 0.4.9 - 2026-11-20

### 보안
- 상세 통계에서 방문자의 그날 ID는 이제 관리자 비밀번호가 아니라 매일 바뀌는 임의의 값으로 솔트됩니다. 비밀번호를 알아도 특정 주소가 방문했는지 확인하는 수단이 되지 않습니다. 이 업데이트를 적용한 날의 순 방문자 수는 높게 나옵니다. [#58](https://github.com/0t2/flux-bio/pull/58)

### 수정
- 게시하는 동안 다른 사람이 초안을 저장하면, 이제 응답이 초안의 실제 버전을 알려 주고 초안이 유지되었다고(`draftKept`) 알립니다. 대시보드는 그 초안을 받아들이거나 어느 쪽을 남길지 묻습니다. [#58](https://github.com/0t2/flux-bio/pull/58)
- 게시와 같은 순간에 페이지 주소가 바뀌거나, 링크의 단축 주소가 바뀌거나, 설정 변경으로 글꼴이 복사되는 중이어도 예전 복사본, 남는 단축 주소, 잘못된 글꼴 파일이 남지 않습니다. [#58](https://github.com/0t2/flux-bio/pull/58)
- 통계를 내려받는 동안 예전 일별 데이터가 월로 합쳐져도 파일에서 숫자가 빠지지 않습니다. 내려받기에 알려 주고 처음부터 다시 시작합니다. [#58](https://github.com/0t2/flux-bio/pull/58)

## 0.4.8 - 2026-11-20

### 수정
- 게시된 페이지가 약 800개를 넘는 사이트에서는 페이지 끄기가 항상 실패했습니다. 이제 요청 한 번에 수백 개씩 내리고 모두 끝날 때까지 자동으로 이어집니다. [#57](https://github.com/0t2/flux-bio/pull/57)
- 페이지와 단축 링크가 합쳐 약 400개를 넘는 사이트에서는 백업 복원이 실패하거나 예전 주소가 계속 응답할 수 있었습니다. 이제 요청 한 번에 수백 개씩 지웁니다. [#57](https://github.com/0t2/flux-bio/pull/57)
- 페이지가 많은 사이트에서 내 사이트에서 글꼴 불러오기를 끄면 글꼴 파일 대부분이 남았고 실패할 수도 있었습니다. 이제 요청 한 번에 수백 개씩 삭제합니다. [#57](https://github.com/0t2/flux-bio/pull/57)
- 큰 사이트에서 설정을 바꾸면 요청 하나에 허용된 것보다 많은 작업을 시작해 실패할 수 있었습니다. [#57](https://github.com/0t2/flux-bio/pull/57)

## 0.4.7 - 2026-11-20

### 보안
- 잘못된 관리자 비밀번호를 API bearer token으로 보내면 이제 로그인 양식과 마찬가지로 응답이 지연됩니다. API로 추측하는 쪽이 더 빠르지 않습니다. [#56](https://github.com/0t2/flux-bio/pull/56)

### 수정
- 내용이 너무 커서 게시할 수 없는 페이지는 이제 저장할 때 거부되며, 크기와 한도 950 KB가 표시됩니다. 이전에는 저장은 되지만 게시에 실패했고 오류만으로는 이유를 알 수 없었습니다. [#56](https://github.com/0t2/flux-bio/pull/56)
- 홈 페이지가 없을 때 사이트 주소에 삭제했거나 옮긴 페이지가 표시되고, 방금 게시한 페이지는 표시되지 않았습니다. [#56](https://github.com/0t2/flux-bio/pull/56)
- 저장되었지만 방문자에게 전달되지 않은 설정 변경은 다음에 대시보드를 열 때 전달됩니다. 다시 저장할 필요가 없습니다. [#56](https://github.com/0t2/flux-bio/pull/56)

## 0.4.6 - 2026-11-20

### 보안
- 초안의 미리보기 링크에서 비밀번호가 걸렸거나 주소를 숨긴 링크의 실제 주소가 더 이상 보이지 않습니다. 이런 버튼은 실제 페이지와 마찬가지로 미리보기에서도 단축 링크를 거칩니다. [#55](https://github.com/0t2/flux-bio/pull/55)
- 링크 비밀번호는 15분 안에 열 번 틀리면 그 시간이 지날 때까지 입력을 받지 않습니다. 이전에는 횟수 제한이 없었습니다. [#55](https://github.com/0t2/flux-bio/pull/55)
- 존재하지 않는 주소가 길수록 더 많은 자원을 쓰는 일이 없어졌습니다. 큰 사이트에서는 비슷한 주소를 찾는 데 요청 시간 한도의 몇 배가 걸릴 수 있었고, 그런 주소는 누구나 보낼 수 있었습니다. [#55](https://github.com/0t2/flux-bio/pull/55)

### 수정
- 보관한 단축 링크, 삭제한 페이지, 페이지의 예전 주소가 변경하는 바로 그 순간에 누군가 방문하면 되살아나 계속 남을 수 있었습니다. [#55](https://github.com/0t2/flux-bio/pull/55)
- 백업을 복원한 뒤, 백업에서 보관 처리된 링크가 계속 리디렉션되는 일이 없어졌습니다. [#55](https://github.com/0t2/flux-bio/pull/55)
- 다른 것이 저장되는 동안 저장한 설정이 덮어써지지 않습니다. 데이터베이스에는 들어갔지만 방문자에게 전달되지 않은 변경은 같은 변경을 다시 하면 전달됩니다. [#55](https://github.com/0t2/flux-bio/pull/55)
- 한 페이지에 id가 같은 항목이 둘 있으면 게시가 거부됩니다. 둘 중 하나의 단축 링크가 작동하지 않았기 때문입니다. [#55](https://github.com/0t2/flux-bio/pull/55)

## 0.4.5 - 2026-11-20

### 수정
- 테스트 사이트나 로컬 사이트가 제공하는 가이드가 더 이상 실제 사이트용 명령을 안내하지 않습니다. 배포 명령에는 `--mode staging`이 붙고, 그 가이드를 실제 사이트의 skill로 저장하라고 AI에게 지시하지도 않습니다. [#52](https://github.com/0t2/flux-bio/pull/52)
- 하나의 Worker에 사이트가 여러 개일 때, 가이드의 ‘FluxBio 제거’가 사이트 하나를 빼려고 Worker 전체와 첫 번째 사이트의 데이터베이스를 AI가 삭제하게 하지 않습니다. [#52](https://github.com/0t2/flux-bio/pull/52)
- `pnpm run deploy`가 이제 Worker에서 실제로 실행 중인 버전을 기준으로 확인합니다. Cloudflare 대시보드에서 롤백한 뒤에는 그것이 최신 버전이 아닐 수 있습니다. `pnpm deploy:images`는 두 번째 사이트의 사진을 그 사이트의 토큰으로 읽고, `pnpm reset-password --mode staging`은 저장되어 있는 실제 사이트의 토큰을 건드리지 않습니다. [#52](https://github.com/0t2/flux-bio/pull/52)
- 내 컴퓨터에서 테스트 사이트를 실행할 때(`cf dev --mode staging`) 더 이상 Cloudflare 로그인이 필요하지 않습니다. [#52](https://github.com/0t2/flux-bio/pull/52)
- `GET /api/update`가 판단할 수 없는 버전이나 변경 기록에 대해 최신이라고 답하지 않고 알 수 없다고(`latest`가 null) 답합니다. [#52](https://github.com/0t2/flux-bio/pull/52)

## 0.4.4 - 2026-11-20

### 수정
- `pnpm reset-password`가 이제 입력한 주소가 이 폴더가 배포하는 Worker의 것인지 먼저 확인한 뒤에 변경합니다. 이전에는 테스트 사이트나 로컬 사이트의 로그인 페이지에 나온 대로 실행하면 실제 사이트의 비밀번호가 바뀌었습니다. 또한 사이트 목록을 실행 중인 Worker에서 가져오고, 비밀번호를 설정하기 전에 저장하며, 토큰을 받지 못한 사이트를 알려 줍니다. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm run deploy`가 새 사이트를 만들기 전에 계정의 모든 Worker를 확인합니다. 이전에는 처음 10개만 보았기 때문에 그 뒤에 있는 FluxBio를 놓쳤습니다. 읽을 수 없는 Worker가 있을 때도 멈추며, 존재하지 않는 실제 사이트의 테스트 사이트는 더 이상 만들지 않습니다. [#51](https://github.com/0t2/flux-bio/pull/51)
- `pnpm update:code`가 새 릴리스가 같은 이름의 파일을 쓰기 시작해도 내 파일을 덮어쓰지 않고, 대소문자만 바뀐 파일을 잃지 않으며, 파일이 폴더로 바뀐 경우에도 중간에 멈추지 않습니다. [#51](https://github.com/0t2/flux-bio/pull/51)
- `worker.json`에 Cloudflare가 허용하는 모든 Worker 이름을 쓸 수 있습니다. 밑줄을 쓸 수 있고 최대 63자입니다. [#51](https://github.com/0t2/flux-bio/pull/51)

## 0.4.3 - 2026-11-20

### 새 기능
- `pnpm update:code`로 FluxBio 폴더의 코드를 최신 릴리스로 올릴 수 있습니다. 업데이트로 무엇이 바뀌는지 보여 주고, 폴더에서 FluxBio 파일이 수정된 경우 멈추며, 내 파일은 그대로 둡니다. 배포는 여전히 별도의 단계입니다. [#50](https://github.com/0t2/flux-bio/pull/50)

## 0.4.2 - 2026-11-20

### 새 기능
- fluxbio.link의 자주 묻는 질문과 사이트 가이드에서 이제 “새 버전은 어떻게 받나요?”에 답합니다. AI에게 묻거나, 대시보드의 설정을 보거나, GitHub에서 프로젝트의 릴리스를 구독해 릴리스마다 이메일을 받을 수 있습니다. [#49](https://github.com/0t2/flux-bio/pull/49)

## 0.4.1 - 2026-11-20

### 새 기능
- 대시보드의 ‘설정’에서 FluxBio 새 버전이 나왔는지 알려 줍니다. 보안 수정이 있으면 먼저 알리고, 업데이트하려면 AI에게 말할 문장도 보여 줍니다. 이 페이지를 열 때만 GitHub에 확인하며, 사이트가 최신이면 아래쪽 버전 옆에 그렇게 표시됩니다. [#48](https://github.com/0t2/flux-bio/pull/48)

## 0.4.0 - 2026-11-20

### 조치 필요
- `cloudflare.config.ts`를 수정한 적이 있다면(`WORKER_NAME`을 바꿨거나, 커스텀 도메인을 추가했거나, `ANALYTICS`를 뺀 경우) 이 버전을 배포하기 전에 그 설정을 FluxBio 폴더의 `worker.json`에 적어 주세요. 예: `{ "name": "my-links", "domains": ["links.example.com"], "analytics": false }`. 이 파일은 코드의 일부가 아니어서 앞으로 업데이트해도 그대로 남습니다. 잊은 경우에는 배포가 멈추고 적어야 할 이름을 알려 줍니다. [#45](https://github.com/0t2/flux-bio/pull/45)

### 새 기능
- `pnpm run deploy`는 업로드하기 전에 Cloudflare에서 무엇이 실행 중인지 확인하고, 빈 사이트를 하나 더 만들거나, 사이트 하나를 오프라인으로 만들거나, 다른 Worker를 덮어쓰거나, 비밀번호를 바꿔 버리는 배포를 막습니다. `cf deploy` 대신 사용하세요. [#45](https://github.com/0t2/flux-bio/pull/45)
- `pnpm reset-password`는 새 관리자 비밀번호를 설정하고 사이트마다 새 API 토큰을 만들며, 둘 다 화면에 표시하지 않습니다. 로그인 페이지의 ‘비밀번호를 잊으셨나요?’에서 이제 이 명령을 안내합니다. [#45](https://github.com/0t2/flux-bio/pull/45)

## 0.3.2 - 2026-11-20

### 새 기능
- 배포에 쓰던 폴더를 삭제했거나 다른 컴퓨터에 두고 와서 없어도, 사용 중인 AI가 다시 만들 수 있습니다. 사이트 가이드의 `/api/guide/rebuild`에 내 Worker 이름이 들어간 절차가 있습니다. 그동안에도 사이트는 계속 동작하고, 사이트의 내용은 아무것도 사라지지 않습니다. [#44](https://github.com/0t2/flux-bio/pull/44)

## 0.3.1 - 2026-11-20

### 새 기능
- `GET /api/update`로 FluxBio의 새 버전이 나왔는지 알 수 있습니다. 사이트가 몇 릴리스 뒤처져 있는지, 그중에 보안 수정이나 ‘조치 필요’ 항목이 있는지 알려 줍니다. 이 변경 기록은 요청이 있을 때만 GitHub에서 읽습니다. 사용 중인 AI가 대화마다 한 번 확인하고, 보안 수정이 기다리고 있으면 가장 먼저 알려 줍니다. [#43](https://github.com/0t2/flux-bio/pull/43)

## 0.3.0 - 2026-11-19

### 새 기능
- 이제 릴리스마다 버전 번호가 있습니다. 사이트가 실행 중인 버전은 `GET /api/state`의 `version`과 `/llms.txt` 첫머리에 나오고, 여기의 제목 하나하나가 한 버전입니다. 번호를 보면 업데이트에 무엇이 필요한지 알 수 있습니다. 가운데 숫자가 바뀌면(0.3.4에서 0.4.0) ‘조치 필요’ 항목이 있고, 마지막 숫자만 바뀌면 배포만 하면 됩니다. 아직 0.2.1로 나오는 사이트는 이 릴리스 이전의 것이므로, 마지막으로 업데이트한 날짜를 기준으로 읽어 주세요. [#41](https://github.com/0t2/flux-bio/pull/41)

## 2026-11-17

### 새 기능
- 이 변경 로그는 여기와 [fluxbio.link](https://fluxbio.link/en/changelog/)에 있습니다.

## 2026-11-11

### 조치 필요
- 아래의 링크 비밀번호 수정 사항을 얻으려면 업데이트하고 재배포하세요. 귀하의 사이트 변경에 관한 다른 사항은 없습니다. [#38](https://github.com/0t2/flux-bio/pull/38)

### 보안
- 페이지 링크의 비밀번호는 건너뛸 수 있습니다. 페이지의 `/_c/<handle>/<id>/link` 주소는 링크의 실제 주소로 응답됩니다. 버튼이 짧은 링크(비밀번호, 숨겨진 주소, 장치 주소, UTM 태그)를 통과하는 링크는 더 이상 전달되거나 계산되지 않습니다. [#38](https://github.com/0t2/flux-bio/pull/38)

### 수정
- 올바른 링크 비밀번호가 Chromium의 대상에 도달하지 못했습니다. [#38](https://github.com/0t2/flux-bio/pull/38)
- 게시 시 클릭 후 입력한 내용이 더 이상 삭제되지 않으며 게시 중 자동 저장이 더 이상 거부되지 않습니다. [#38](https://github.com/0t2/flux-bio/pull/38)
- 대시보드의 각 설정 스위치는 변경된 내용만 보냅니다. 이전에는 토글을 통해 소유자의 AI가 도메인과 시간대를 포함하여 설정한 내용을 취소할 수 있었습니다. [#38](https://github.com/0t2/flux-bio/pull/38)
- KV가 삭제를 거부하고 5,000KV 키가 지나면 중지되고 완료되었다고 말하면 사이트를 지우면 테이블이 없는 데이터베이스가 남을 수 있습니다. [#38](https://github.com/0t2/flux-bio/pull/38)

## 2026-11-09

### 변경
- 설정 스위치의 이름은 짧은 링크 전용이며, 켜져 있으면 소개 페이지가 꺼져 있음을 의미합니다. 약력 페이지의 이름을 따서 명명되었지만 끄는 작업이 설명되어 있어 짧은 링크 전용 사이트의 소유자가 이 내용을 거꾸로 읽었습니다. [#37](https://github.com/0t2/flux-bio/pull/37)

### 수정
- `cloudflare.config.ts`이(가) 작업자가 가져오는 모듈을 가져왔기 때문에 `pnpm dev` 시작하지 못했습니다. [#36](https://github.com/0t2/flux-bio/pull/36)

## 2026-11-07

### 조치 필요
- `pnpm deploy:images`을(를) 사용하여 사진을 정적 파일로 제공하는 경우 이 버전을 배포한 다음 다시 한 번 실행하세요. 이제 새로운 `GET /api/media/{id}`을(를) 통해 각 사이트의 사진을 읽고 그로부터 번들을 다시 빌드합니다. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07), [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)

### 보안
- 사용자 정의 도메인 확인은 요청된 호스트 이름에 바인딩되므로 한 호스트 이름에 대해 응답된 확인이 다른 호스트 이름으로 전달될 수 없습니다. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)
- 두 개 이상의 사이트를 보유한 작업자에서 정적 파일로 제공되는 각 사이트의 사진은 이제 해당 사이트의 폴더에 있으며 사이트는 `/media/<id>`에서 자체 사이트만 제공됩니다. 이전에는 모든 사이트가 하나의 폴더를 공유했습니다. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 새 기능
- `GET /api/media/{id}`는 백업 및 `pnpm deploy:images`용으로 사진의 현재 바이트를 토큰에 제공합니다. [905591e](https://github.com/0t2/flux-bio/commit/905591e671faeaaf343dd3a576875d905844da07)

### 변경
- 업로드 또는 복원 시 ID를 덮어쓸 수 있으므로 `pnpm deploy:images`는 실행할 때마다 모든 사진을 다운로드하고 다운로드하기 전에 읽고 있는 사이트와 모드를 확인합니다. [4dc36df](https://github.com/0t2/flux-bio/commit/4dc36dfba956d75de4e8a8335d1fa61bfbe0dc47)
- 소유자의 AI가 읽는 가이드는 절대 덮어쓰지 않는 스냅샷 폴더에 `GET /api/media/{id}`로 백업하고 정의된 순서에 따라 첫 번째 페이지를 설정합니다. [8db0091](https://github.com/0t2/flux-bio/commit/8db00919d305b3d41ea5fb2a8637f56e382a87ad)

## 2026-11-06

### 조치 필요
- 데이터베이스가 오늘 `7b0bad4` 이전의 빌드로 마지막으로 열린 경우 먼저 스쿼시(`8d0c435`) 직전에 빌드를 배포하고 사이트를 한 번 연 다음 이 빌드를 배포하세요. 마이그레이션이 하나로 압축되었으며 이전 데이터베이스 중 10개 미만(10개 미만의 `SELECT value FROM _meta WHERE key = 'schema_version'`)을 실행한 데이터베이스는 이제 최신 것으로 간주되므로 열과 인덱스가 누락됩니다. 10의 신규 설치 및 데이터베이스는 영향을 받지 않습니다. [#27](https://github.com/0t2/flux-bio/pull/27)
- pnpm 10.34.5 이상을 사용하여 설치하세요. 이제 프로젝트 이름은 `package.json`에서 pnpm 12.18.0으로 지정되고 이전 pnpm은 "pnpm 전환 실패" 메시지와 함께 중지됩니다. `AGENTS.md`의 설치 프로그램이 이를 대체하고 해당 단계가 변경되었습니다(pnpm 폴더의 `pnpm runtime set node 24 --global`, `bin`). pnpm의 설정은 이제 `pnpm-workspace.yaml`에 있습니다. [#19](https://github.com/0t2/flux-bio/pull/19)

### 보안
- 링크 페이지는 https 주소에서 로드된 사이트 자체(동영상이 있는 페이지의 YouTube 미리보기 이미지 포함)에서만 사진을 로드합니다. [#32](https://github.com/0t2/flux-bio/pull/32)
- 페이지 자체 CSS는 승인되기 전에 브라우저가 읽는 것처럼 읽혀지며 사이트 자체 사진만 로드할 수 있습니다. [#32](https://github.com/0t2/flux-bio/pull/32)

### 새 기능
- 하나의 작업자에 여러 사이트가 있으며 각각 자체 데이터베이스, KV, 통계, 설정 및 도메인이 `sites.json`에 나열되어 있습니다. 해당 파일이 없으면 작업자는 이전과 마찬가지로 하나의 사이트입니다. [#23](https://github.com/0t2/flux-bio/pull/23)
- 한 번의 탭으로 페이지 위에 Ko-fi 또는 Calendly의 패널을 여는 블록과 플로팅 버튼을 삽입할 수 있습니다. 탭하기 전에는 아무것도 로드되지 않습니다. [#28](https://github.com/0t2/flux-bio/pull/28)
- 소유자의 AI는 자체 CSS 링크 페이지(`appearance.css`)를 제공할 수 있으므로 "내 페이지를 이 그림처럼 보이게 만들기"는 링크 페이지를 유지합니다. [#32](https://github.com/0t2/flux-bio/pull/32)
- 페이지 배경은 패턴(`appearance.bgTile`)에 대해 설정된 크기로 반복될 수 있습니다. [#29](https://github.com/0t2/flux-bio/pull/29)
- 소셜 아이콘은 링크(`appearance.socialPlace`) 뒤에 올 수 있으며, 이름은 숨겨도 페이지 제목(`appearance.showName`)으로 유지될 수 있습니다. [#33](https://github.com/0t2/flux-bio/pull/33)
- 아무 것도 사용하지 않는 사진은 나열 및 삭제할 수 있습니다: `GET` 및 `DELETE /api/media/unused`. [#8](https://github.com/0t2/flux-bio/pull/8)
- 설정에는 계획, 데이터베이스 크기 및 일일 무료 할당량 사용이 표시되며 `pnpm usage`는 계정에서 이를 읽습니다. [8f40792](https://github.com/0t2/flux-bio/commit/8f407922b1f922dddb838f507ba81d228806a2f7), [2620cf6](https://github.com/0t2/flux-bio/commit/2620cf6d7db9634623c6bef79c7cddf0cf0c5bd1)
- 일일 통계는 13개월 동안 보관된 후 한 달에 한 행으로 병합되며 모든 통계는 CSV로 다운로드할 수 있습니다. [7b0bad4](https://github.com/0t2/flux-bio/commit/7b0bad45a93a102bf11a88a79e2285010d79918c)
- `pnpm deploy:images`는 사이트의 사진을 정적 파일로 제공하므로 작업자 요청이나 KV 읽기 비용이 들지 않습니다. [71b9ed2](https://github.com/0t2/flux-bio/commit/71b9ed2817ff71c76bad9622f82e60ec9a487ac2)
- 새로운 블록을 요청하기 위한 발행 양식입니다. [#31](https://github.com/0t2/flux-bio/pull/31)
- fluxbio.link에는 트래픽 및 비용 추정기가 있습니다. [fec68c7](https://github.com/0t2/flux-bio/commit/fec68c70d24ae048eee847bf8f8d1cf79b27c504)

### 변경
- 페이지 또는 짧은 링크에 제한이 없습니다. 방문자나 소유자가 기다리는 것은 전체 테이블을 읽지 않으며 대시보드는 한 번에 한 화면 전체에 짧은 링크를 로드합니다. [4ab8ab7](https://github.com/0t2/flux-bio/commit/4ab8ab7a8a17fa44d457c3b94802e6e65899a2b2)
- 실행 비용이 더 저렴함: 페이지 보기에는 KV 읽기 1회가 필요하고, 서로 의존하지 않는 D1 쿼리가 함께 진행되며, 대시보드는 작업자에게 더 적은 비용을 요청하고, 페이지 보기에는 CPU의 약 1/3을 차지합니다. [#6](https://github.com/0t2/flux-bio/pull/6), [#7](https://github.com/0t2/flux-bio/pull/7), [#17](https://github.com/0t2/flux-bio/pull/17), [#18](https://github.com/0t2/flux-bio/pull/18)
- 페이지와 대시보드 미리보기에서는 전체 글꼴이 아닌 표시되는 문자만 포함된 중국어 글꼴을 Google에 요청합니다. [#9](https://github.com/0t2/flux-bio/pull/9), [#13](https://github.com/0t2/flux-bio/pull/13)
- 이전 셰이프에 저장된 데이터를 읽는 코드는 사라졌습니다: 이전 설정 및 페이지 셰이프, 이전 백업 파일, `ADMIN_TOKEN`, `/shorten` 페이지 및 이전 대시보드 주소. [#27](https://github.com/0t2/flux-bio/pull/27)
- FluxBio를 설치하라는 메시지는 먼저 코드를 다운로드하고 에이전트가 폴더에서 `AGENTS.md`를 13개 언어로 읽도록 합니다. [#21](https://github.com/0t2/flux-bio/pull/21)
- 소유자의 AI가 읽는 가이드는 짧은 기본 가이드와 필요할 때 읽는 주제로 나누어지며, 각 테마의 버튼 색상, 글꼴 로드 방법, 패턴 만드는 방법을 알려줍니다. [#30](https://github.com/0t2/flux-bio/pull/30), [#34](https://github.com/0t2/flux-bio/pull/34)
- FluxBio 사이트의 GitHub 작업에서 배포는 이 저장소에서만 발생하며 사이트 이름이 지정된 경우에만 발생합니다. 복사본은 아무것도 배포하지 않습니다. [#14](https://github.com/0t2/flux-bio/pull/14)

### 수정
- 확인하려는 모든 도메인에 대해 522로 사용자 정의 도메인을 저장하지 못했습니다. [#35](https://github.com/0t2/flux-bio/pull/35)
- `appearance.css` 이전에 게시된 페이지는 다시 게시될 때까지 500으로 응답했습니다. [#32](https://github.com/0t2/flux-bio/pull/32)
- 대시보드는 로드할 때마다 더 이상 브라우저 콘솔에 CSP 위반을 표시하지 않습니다. [#20](https://github.com/0t2/flux-bio/pull/20)
- 스크린샷에서 페이지를 재구성하는 AI에 대한 수정 사항: 주소의 CSS 속성 선택기, `POST /api/themes`의 표지 및 배경 그림에 대한 `null`, `GET /api/themes/community?lang=`의 소유자 언어로 된 테마 이름. [#33](https://github.com/0t2/flux-bio/pull/33)

## 2026-11-05

### 새 기능
- 첫 번째 공개 릴리스: 소유자의 AI가 실행하는 하나의 Cloudflare 작업자에 대한 소개 링크, 짧은 링크 및 클릭 추적. [1a2f552](https://github.com/0t2/flux-bio/commit/1a2f552a2ebbb3b29284a366ac6f56ea2dfa8056)

