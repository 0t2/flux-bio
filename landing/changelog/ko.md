# Changelog

What changed in FluxBio, a release at a time, newest first. fluxbio.link shows this file at `/en/changelog/` and is made from it.
If you host your own, you take `main`. Your site says which version it runs, in `version` of `GET /api/state` and at the top of `/llms.txt`, so after updating read the releases above that one. The number says what updating takes: a release that changes the middle number (0.3.4 to 0.4.0) has an "Action needed", and one that changes only the last (0.3.4 to 0.3.5) needs nothing but the deploy.

The format is narrow because a script reads it: `## <version> - YYYY-MM-DD` (newest first), then `### ` and one of Action needed, Security, New, Changed, Fixed (in that order), then `- ` entries on one line each, with only `code` and `[links](https://…)` as markup. `tests/changelog.test.ts` holds it. A change someone using FluxBio would see gets a release of its own, on top, in the same pull request, with its version in `package.json` too: the next minor if it has an Action needed, else the next patch. Leave purely internal work out. The date is the day the change reaches `main`. The headings below 0.3.0 are days without a version, because every site of those days called itself 0.2.1.

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

