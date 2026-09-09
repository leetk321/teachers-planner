# 디지털 교무수첩 Synology 배포 가이드

## 배포 구조

- Web 외부 포트는 기존과 동일한 `3000`입니다.
- API 외부 포트는 기존과 동일한 `4000`입니다.
- Web이 사용하는 API 주소 예제 기본값은 `https://api.note.example.com`입니다. 실제 운영 도메인으로 변경해야 합니다.
- 영속 데이터 경로 예제는 `/volume1/docker/teacher-notebook-data`입니다. 이 문서의 호스트 경로를 실제 NAS 데이터 경로에 맞춰 바꾸고, 기존 설치에서는 기존 데이터 폴더를 유지합니다.
- 애플리케이션 소스는 더 이상 컨테이너에 마운트하지 않습니다. 빌드된 버전 이미지 안에 포함됩니다.
- 컨테이너 재시작 시 `npm install` 또는 Next.js 빌드를 수행하지 않습니다.
- Web과 API는 모두 비루트 UID/GID `1000:1000`으로 실행됩니다.

## 최초 전환 전 확인

기존 데이터 폴더를 별도 위치에 먼저 복사하고 다음 항목을 확인합니다.

```sh
sudo ls -lah /volume1/docker/teacher-notebook-data
sudo ls -lh /volume1/docker/teacher-notebook-data/local.db
sudo cp -a /volume1/docker/teacher-notebook-data \
  /volume1/docker/teacher-notebook-data-before-immutable-images
```

기존 컨테이너가 루트 사용자로 파일을 생성했다면 새 비루트 API가 쓸 수 있도록 소유권을 한 번 조정합니다.

```sh
sudo chown -R 1000:1000 /volume1/docker/teacher-notebook-data
sudo chmod -R u+rwX /volume1/docker/teacher-notebook-data
```

`local.db`가 기대한 크기인지 반드시 확인한 뒤 진행합니다. 데이터 폴더가 비어 있으면 기존 NAS 경로를 다시 확인하십시오.

## 환경 파일

프로젝트 루트에서 예제 파일을 복사합니다.

```sh
cp .env.synology.example .env
```

`.env`에서 `TEACHER_NOTEBOOK_VERSION`, `DATA_HOST_PATH`, `NEXT_PUBLIC_API_BASE_URL`, `CORS_ORIGINS`를 확인합니다. `.env`에는 운영 비밀값을 추가할 수 있으므로 외부에 배포하지 않습니다.

### 운영 도메인 설정 (필수)

`note.example.com`과 `api.note.example.com`은 설명용 도메인이며 실제 서비스 주소가 아닙니다. 이미지 빌드 전에 다음 설정을 완료합니다.

- 소유한 Web/API 도메인의 DNS를 NAS에 연결하고 두 도메인에 유효한 HTTPS 인증서를 설정합니다.
- NAS 역방향 프록시에서 Web 도메인은 Web 포트(기본 `3000`), API 도메인은 API 포트(기본 `4000`)로 전달합니다. 포트를 변경했다면 `.env`의 `WEB_PORT`, `API_PORT`와 일치시킵니다.
- `NEXT_PUBLIC_API_BASE_URL`에는 브라우저에서 접근 가능한 실제 API HTTPS 주소를 설정합니다.
- `CORS_ORIGINS`에는 실제 Web origin(프로토콜, 호스트, 필요한 경우 포트)을 설정합니다. API 주소가 아니라 브라우저가 Web에 접속하는 주소입니다.
- `NEXT_PUBLIC_API_BASE_URL`은 빌드 시 Web 번들에 포함되므로 변경 후에는 Web 이미지를 다시 빌드하고 재배포합니다. 컨테이너 환경변수만 바꿔서는 기존 번들이 변경되지 않습니다.

NAS IP로 직접 Web에 접속해 테스트할 때도 해당 origin을 CORS 설정에 반영하고, 브라우저에서 설정된 API 주소에 접근할 수 있는지 확인합니다.

## 기존 데이터 볼륨 1회 등록

먼저 이미지를 빌드합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env build --pull
```

기존 `local.db`가 들어 있는 데이터 폴더는 다음 명령으로 등록합니다. DB가 없으면 이 명령은 실패하므로 잘못 연결된 빈 볼륨을 정상 데이터로 오인하지 않습니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-data-volume.mjs --initialize-existing
```

완전히 새로운 설치에서만 아래 명령을 사용합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-data-volume.mjs --initialize-new
```

새 설치에는 아직 `local.db`가 없으므로 API를 먼저 한 번 기동해 DB를 생성한 후 백업 절차를 실행합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env up -d --no-build api
docker compose -f docker-compose.synology.yml --env-file .env ps
```

표식 파일은 `/volume1/docker/teacher-notebook-data/.teacher-notebook-volume.json`에 생성됩니다. 이후 표식이 없거나 다른 DB 파일을 가리키면 API가 기동되지 않습니다.

## 첫 배포

서비스를 올리기 전에 온라인 SQLite 백업과 검증을 실행합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/backup-sqlite.mjs --label pre-immutable-deploy
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-sqlite-backup.mjs
docker compose -f docker-compose.synology.yml --env-file .env up -d --no-build
docker compose -f docker-compose.synology.yml --env-file .env ps
```

`teacher-api`가 먼저 healthy 상태가 된 후 `teacher-web`이 시작됩니다. Container Manager에서도 두 컨테이너의 상태가 정상인지 확인합니다.

```text
Web: http://<NAS_IP>:3000
API: http://<NAS_IP>:4000/health
```

## 이후 버전 배포

버전마다 서로 다른 이미지 태그를 사용합니다. SSH 배포가 가능하면 아래 스크립트가 이미지 빌드, 볼륨 검사, 배포 전 DB 백업, 백업 검증과 기동을 순서대로 수행합니다.

```sh
sh scripts/deploy-release.sh 3.16.0
```

Container Manager UI만 사용하는 경우 `.env`의 `TEACHER_NOTEBOOK_VERSION`을 새 버전으로 바꾸고 프로젝트를 빌드한 뒤, 위 백업·검증 명령을 수행하고 프로젝트를 다시 생성합니다. 동일 버전 태그를 덮어쓰지 마십시오.

## 코드 롤백

직전 이미지가 NAS에 남아 있으면 DB와 첨부파일은 건드리지 않고 코드만 되돌릴 수 있습니다.

```sh
sh scripts/rollback-release.sh 3.14.7
```

버전 인수를 생략하면 `.deploy/previous-version`을 사용합니다. DB 마이그레이션이 포함된 배포는 구버전 코드가 새 스키마를 읽을 수 있는지 먼저 확인해야 합니다. 확인되지 않았다면 아래 DB 복원 절차를 함께 사용합니다.

## SQLite 백업과 검증

백업은 실행 중인 SQLite에 온라인 백업 API를 사용하므로 단순 `local.db` 복사보다 안전합니다. 각 백업에는 SHA-256, 파일 크기, 무결성 검사와 테이블별 건수가 기록된 manifest가 함께 생성됩니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/backup-sqlite.mjs --label daily
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-sqlite-backup.mjs
```

백업은 `/volume1/docker/teacher-notebook-data/backups`에 저장됩니다. 기본 보존 정책은 최근 30개이면서 90일 이내인 파일입니다. DSM 작업 스케줄러에서 매일 백업 명령을 실행하고 Hyper Backup에는 다음 항목을 포함하십시오.

- `backups/`의 검증된 SQLite 백업과 manifest
- `uploads/`
- `student-photos/`
- `.teacher-notebook-volume.json`

실행 중인 원본 `local.db`, `local.db-wal`, `local.db-shm`만 직접 복사하는 방식은 사용하지 않는 것이 좋습니다. DB와 첨부파일을 완전히 같은 시점으로 보관해야 한다면 API를 잠시 중지한 뒤 데이터 폴더 전체를 NAS snapshot 또는 Hyper Backup으로 백업합니다.

## SQLite 복원

먼저 대상 백업을 검증합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-sqlite-backup.mjs --backup /app/apps/api/.data/backups/<backup>.sqlite3
```

Web과 API를 모두 중지한 뒤 복원합니다. 실행 중인 API가 만든 `local.db-wal` 또는 `local.db-shm`이 남아 있으면 복원 스크립트가 중단됩니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env stop web api
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/restore-sqlite-backup.mjs \
  --backup /app/apps/api/.data/backups/<backup>.sqlite3 \
  --target /app/apps/api/.data/local.db \
  --confirm-restore
docker compose -f docker-compose.synology.yml --env-file .env up -d --no-build
```

기존 DB는 `local.db.pre-restore-<시각>`으로 남습니다. 이 절차는 SQLite만 복원하므로 첨부파일도 되돌려야 한다면 동일 시점의 Hyper Backup 또는 snapshot을 사용합니다.

## 배포 전 로컬 검증

프로젝트 루트에서 다음 명령을 실행합니다.

```sh
node scripts/verify-deployment.mjs
cd apps/api
node --check scripts/start-api.mjs
node --check scripts/container-readiness.mjs
node scripts/check-api-health.mjs
node scripts/test-backup-roundtrip.mjs
node scripts/test-volume-safety.mjs
```

`verify-deployment.mjs`는 `compose.yaml`과 `docker-compose.synology.yml`의 서비스 이미지, 환경변수, 볼륨, healthcheck 의미가 일치하는지 검사합니다. `deploy-release.sh`도 시작 시 두 Compose가 다르면 이미지 빌드 전에 즉시 중단합니다.

Docker가 설치된 환경에서는 Compose 해석과 이미지 빌드도 확인합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env config
docker compose -f docker-compose.synology.yml --env-file .env build
```

## 장애 확인

- API 로그에 `Data-volume marker missing`이 나오면 새 볼륨을 초기화하지 말고 `DATA_HOST_PATH`가 기존 데이터 폴더인지 먼저 확인합니다.
- `permission denied`가 나오면 데이터 폴더의 UID/GID가 `1000:1000`인지 확인합니다.
- Web 이미지 빌드 후 API 주소를 변경했다면 Web 이미지를 다시 빌드해야 합니다. `NEXT_PUBLIC_API_BASE_URL`은 빌드 시 번들에 포함됩니다.
- 오래된 이미지는 새 버전이 충분히 검증된 후에만 정리합니다. 직전 버전 이미지는 항상 남겨 두는 것을 권장합니다.

## 전체 데이터 번들 백업

SQLite와 `uploads/`, `student-photos/`를 같은 시점의 검증 가능한 폴더로 보관하려면 전체 데이터 번들 도구를 사용합니다. SQLite는 실행 중인 DB를 직접 복사하지 않고 기존 온라인 백업 도구를 재사용합니다. 첨부파일을 복사하는 동안 파일 목록이나 크기·수정 시각이 바뀌면 불완전한 번들을 남기지 않고 실패합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/backup-data-bundle.mjs --label daily
```

기본 저장 위치는 다음과 같습니다.

```text
/app/apps/api/.data/backups/data-bundles/teacher-notebook-data-<시각>-daily/
```

각 번들에는 온라인 SQLite 백업, SQLite 자체 manifest, `uploads/`, `student-photos/`, 전체 파일의 상대경로·크기·SHA-256을 기록한 `manifest.json`, manifest 체크섬인 `manifest.sha256`이 들어갑니다. 심볼릭 링크, 데이터 폴더 밖을 가리키는 경로, 경로탈출 항목, 대소문자만 다른 충돌 경로는 거부됩니다.

백업 직후에는 반환된 번들 경로를 사용해 반드시 검증합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-data-bundle.mjs \
  --bundle /app/apps/api/.data/backups/data-bundles/<bundle-folder>
```

검증기는 manifest 자체의 SHA-256, 모든 DB·첨부·사진 파일의 크기와 SHA-256, SQLite `quick_check`, `integrity_check`, 테이블별 행 수를 확인합니다. 파일 하나라도 누락·추가·변조되면 실패합니다. DSM 작업 스케줄러에서는 전체 번들 생성 후 검증 명령이 성공한 경우에만 외부 백업 대상으로 전송하십시오.

## 전체 데이터 번들 복원

복원은 Web과 API를 모두 중지하고 수행합니다. 대상 `DATA_DIR`는 생략할 수 없으며, 스크립트는 원본 번들을 먼저 완전히 검증합니다. 그 다음 현재 대상 DB·첨부·사진의 별도 `pre-restore` 안전 번들을 만들고 검증한 뒤에만 임시 경로에서 교체를 시작합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env stop web api
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/restore-data-bundle.mjs \
  --bundle /app/apps/api/.data/backups/data-bundles/<bundle-folder> \
  --target-data-dir /app/apps/api/.data \
  --confirm-restore
```

복원 직전 안전 번들의 기본 위치는 `/app/apps/api/.data/backups/restore-safety/`입니다. DB의 `-wal` 또는 `-shm` 파일이 남아 있으면 API가 완전히 정지되지 않은 것으로 보고 복원을 거부합니다. DB와 두 파일 폴더는 같은 파일시스템의 staging·rollback 경로를 거쳐 교체하며, 설치 후 체크섬이나 DB 무결성 검사가 실패하면 기존 항목을 되돌립니다.

복원 후 다시 검증하고 컨테이너를 시작합니다.

```sh
docker compose -f docker-compose.synology.yml --env-file .env run --rm --no-deps api \
  node scripts/verify-data-volume.mjs
docker compose -f docker-compose.synology.yml --env-file .env up -d --no-build
docker compose -f docker-compose.synology.yml --env-file .env ps
```

실제 운영 복원 전에 별도 테스트 폴더에 번들을 복원해 파일 수와 주요 데이터를 점검하는 것을 권장합니다. `restore-data-bundle.mjs`를 API가 실행 중인 운영 데이터 폴더에 사용하지 마십시오.
