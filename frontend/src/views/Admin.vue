<template>
  <div class="admin container">
    <header class="page-head">
      <div>
        <h1 class="page-title">管理后台</h1>
        <p class="page-sub">管理用户、ROM 以及站点设置</p>
      </div>
    </header>

    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-icon icon-blue">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">用户</div>
          <div class="stat-value">{{ users.length }}</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon icon-orange">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">ROM</div>
          <div class="stat-value">{{ roms.length }}</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon icon-green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/><path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">公开 ROM</div>
          <div class="stat-value">{{ publicRomCount }}</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon icon-purple">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </span>
        <div class="stat-body">
          <div class="stat-label">管理员</div>
          <div class="stat-value">{{ adminCount }}</div>
        </div>
      </div>
    </div>

    <nav class="seg admin-seg">
      <button class="seg-btn" :class="{ active: tab === 'site' }" @click="tab = 'site'">站点</button>
      <button class="seg-btn" :class="{ active: tab === 'remote' }" @click="tab = 'remote'">远端</button>
      <button class="seg-btn" :class="{ active: tab === 'users' }" @click="tab = 'users'">用户</button>
      <button class="seg-btn" :class="{ active: tab === 'roms' }" @click="tab = 'roms'">ROM</button>
      <button class="seg-btn" :class="{ active: tab === 'bios' }" @click="tab = 'bios'">BIOS</button>
    </nav>

    <section v-if="tab === 'site'" class="panel-card panel panel-site site-settings">
      <h2 class="panel-title">站点设置</h2>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">01</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">基本信息</h3>
            <p class="site-block-desc">设置网站对外显示的名称和副标题。</p>
          </div>
        </div>
        <div class="site-fields">
          <div class="field">
            <label class="label" for="site-title">网站名称</label>
            <input id="site-title" v-model.trim="form.siteTitle" class="input" maxlength="40" placeholder="Games Online" />
          </div>
          <div class="field">
            <label class="label" for="site-subtitle">副标题</label>
            <input id="site-subtitle" v-model.trim="form.siteSubtitle" class="input" maxlength="80" />
          </div>
        </div>
      </div>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">02</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">功能开关</h3>
            <p class="site-block-desc">控制用户能否联机、试玩和上传 ROM。</p>
          </div>
        </div>
        <div class="toggle-grid">
          <label class="toggle-row">
            <div class="toggle-text">
              <div class="tr-t">开启对战功能</div>
              <div class="tr-s">关闭后用户无法创建或加入房间；管理员不受影响</div>
            </div>
            <div class="toggle-sw">
              <input type="checkbox" v-model="form.netplayEnabled" />
              <span class="sw-track"><span class="sw-thumb"></span></span>
            </div>
          </label>

          <label class="toggle-row">
            <div class="toggle-text">
              <div class="tr-t">允许游客试玩</div>
              <div class="tr-s">开启后未登录用户可以试玩公开 ROM；存档和对战控制权仍然需要登录</div>
            </div>
            <div class="toggle-sw">
              <input type="checkbox" v-model="form.guestPlayEnabled" />
              <span class="sw-track"><span class="sw-thumb"></span></span>
            </div>
          </label>

          <label class="toggle-row">
            <div class="toggle-text">
              <div class="tr-t">允许普通用户上传 ROM</div>
              <div class="tr-s">关闭后只有管理员可以上传 ROM，普通用户的上传接口会被拒绝</div>
            </div>
            <div class="toggle-sw">
              <input type="checkbox" v-model="form.userUploadEnabled" />
              <span class="sw-track"><span class="sw-thumb"></span></span>
            </div>
          </label>
        </div>
      </div>

      <div class="site-actions">
        <div class="site-status">
          <Transition name="saved">
            <span v-if="siteSaved" class="saved">已保存</span>
          </Transition>
        </div>
        <button class="btn btn-primary site-save" :disabled="savingSite" @click="saveSite">
          {{ savingSite ? '保存中…' : '保存' }}
        </button>
      </div>
    </section>

    <section v-if="tab === 'remote'" class="panel-card panel panel-site remote-settings">
      <h2 class="panel-title">远端设置</h2>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">01</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">STUN 服务器（可选）</h3>
            <p class="site-block-desc">帮助浏览器发现公网地址，改善跨网络联机的连接成功率。</p>
          </div>
        </div>
        <div class="field">
          <label class="label" for="webrtc-stun-urls">STUN 服务器地址</label>
          <textarea id="webrtc-stun-urls" v-model.trim="form.webrtcStunUrls" class="input" rows="3" maxlength="2000" placeholder="留空即可部署；后续填写 stun:主机:端口，多个地址用逗号或换行分隔"></textarea>
          <p class="field-hint">STUN 用于联机时发现公网地址。</p>
          <div class="remote-test">
            <button class="btn" type="button" :disabled="testingStun" @click="testStun">
              {{ testingStun ? '测试中…' : '测试 STUN 服务器' }}
            </button>
          </div>
          <p v-if="stunTestResult" class="remote-test-result stun-test-result" :class="{ ok: stunTestResult.ok }">{{ stunTestResult.text }}</p>
        </div>
      </div>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">02</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">TURN 中继（可选）</h3>
            <p class="site-block-desc">为无法直接连通的玩家提供中继通道。</p>
          </div>
        </div>
        <div class="field">
          <label class="label" for="webrtc-turn-urls">TURN 服务器地址</label>
          <textarea id="webrtc-turn-urls" v-model.trim="form.webrtcTurnUrls" class="input" rows="2" maxlength="2000" placeholder="留空即不启用中继；填写 turn:主机:端口?transport=udp,turn:主机:端口?transport=tcp"></textarea>
          <p class="field-hint">只有双方网络无法直连（对称 NAT、公司/校园网）时才会用到中继，能直连的玩家不受影响。</p>
        </div>
        <div class="site-fields">
          <div class="field">
            <label class="label" for="webrtc-turn-username">TURN 用户名</label>
            <input id="webrtc-turn-username" v-model.trim="form.webrtcTurnUsername" class="input" maxlength="128" placeholder="和 TURN 服务器上的 user= 一致" />
            <p class="field-hint">仅在没填下面的共享密钥时使用，且只下发给已登录用户。</p>
          </div>
          <div class="field">
            <label class="label" for="webrtc-turn-credential">TURN 密码</label>
            <input id="webrtc-turn-credential" v-model.trim="form.webrtcTurnCredential" class="input" type="password" autocomplete="new-password" maxlength="256" placeholder="和 TURN 服务器上的密码一致" />
          </div>
        </div>
        <div class="site-fields">
          <div class="field">
            <label class="label" for="webrtc-turn-secret">共享密钥（推荐）</label>
            <input id="webrtc-turn-secret" v-model.trim="form.webrtcTurnSecret" class="input" type="password" autocomplete="new-password" maxlength="256" placeholder="coturn 的 static-auth-secret，至少 16 位" />
            <p class="field-hint">填了就走临时凭据：浏览器只拿到 <code>过期时间戳:用户名</code> 和一次性的签名密码，密钥留在服务端，泄露的凭据也会自动失效。</p>
          </div>
          <div class="field">
            <label class="label" for="webrtc-turn-ttl">临时凭据有效期（秒）</label>
            <input id="webrtc-turn-ttl" v-model.trim="form.webrtcTurnTtl" class="input" inputmode="numeric" maxlength="5" placeholder="留空用默认 3600（1 小时）" />
            <p class="field-hint">300 ~ 86400 秒。客户端会在到期前自动重取，填太长等于把有效期外的窗口拉长。</p>
          </div>
        </div>
        <div class="remote-test">
          <button class="btn" type="button" :disabled="testingTurn" @click="testTurn">
            {{ testingTurn ? '测试中…' : '测试 TURN 中继' }}
          </button>
          <span class="field-hint stun-test-note">没填用户名/密码时只检查端口是否可达；填了会真的分配一次中继端口</span>
        </div>
        <p v-if="turnTestResult" class="remote-test-result stun-test-result" :class="{ ok: turnTestResult.ok }">{{ turnTestResult.text }}</p>
      </div>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">03</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">远端存储（大 ROM）</h3>
            <p class="site-block-desc">将大体积 ROM 交给独立存储服务，减少本站磁盘和带宽压力。</p>
          </div>
        </div>
        <div class="field">
          <label class="label" for="remote-url">远端服务地址</label>
          <input id="remote-url" v-model.trim="form.remoteUploadUrl" class="input" maxlength="200" placeholder="http://127.0.0.1:8790 或 http://另一台服务器:8790" />
          <p class="field-hint">上传 ROM 时可以选择转存到这台服务器。远端服务代码在 <code>/rom-upload</code>，详见该目录的 README。</p>
        </div>
        <div class="site-fields">
          <div class="field">
            <label class="label" for="remote-token">远端密钥</label>
            <input id="remote-token" v-model.trim="form.remoteUploadToken" class="input" type="password" autocomplete="new-password" maxlength="256" placeholder="和远端 config.json 里的 token 一致" />
          </div>
          <div class="field">
            <label class="label">连接测试</label>
            <div class="remote-test">
              <button class="btn" type="button" :disabled="testingRemote" @click="testRemote">
                {{ testingRemote ? '测试中…' : '测试连接' }}
              </button>
              <span v-if="remoteTestResult" class="remote-test-result" :class="{ ok: remoteTestResult.ok }">
                {{ remoteTestResult.text }}
              </span>
            </div>
          </div>
        </div>
        <p class="field-hint">远端是否可用只看「地址 + 密钥」是否都已保存：都填好后，上传 ROM 时就会出现「上传到远端服务器」开关。</p>
      </div>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">04</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">本地 ROM 一键迁移</h3>
            <p class="site-block-desc">把本站磁盘上的 ROM 逐个转存到远端存储。记录 id、收藏、存档、房间、父子版本都不变，本地文件保留作兜底。</p>
          </div>
        </div>

        <div class="migrate-facts">
          <div class="migrate-fact">
            <span class="mf-label">待迁移（本站磁盘）</span>
            <span class="mf-value">{{ pendingText }}</span>
          </div>
          <div class="migrate-fact">
            <span class="mf-label">远端 ROM 的本地副本</span>
            <span class="mf-value">{{ localCopiesText }}</span>
          </div>
        </div>

        <template v-if="migrationTask?.running">
          <div class="migrate-progress" role="progressbar" :aria-valuemin="0" :aria-valuemax="migrationTask.total" :aria-valuenow="migrationTask.processed">
            <span class="mp-bar" :style="{ width: `${migratePercent}%` }"></span>
          </div>
          <p class="migrate-line">
            正在迁移 {{ migrationTask.processed }}/{{ migrationTask.total }} · 成功 {{ migrationTask.migrated }} · 失败 {{ migrationTask.failed }}
            <template v-if="migrationTask.current"> · 当前：{{ migrationTask.current.title }}（{{ fmtSize(migrationTask.current.fileSize) }}）</template>
          </p>
        </template>
        <p v-else-if="migrationTask?.finishedAt" class="migrate-line">
          上次迁移：成功 {{ migrationTask.migrated }} 个（{{ fmtSize(migrationTask.migratedBytes) }}），失败 {{ migrationTask.failed }} 个<template v-if="migrationTask.note"> · {{ migrationTask.note }}</template>
        </p>

        <div class="remote-test">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="migrationBusy || migrationTask?.running || !migration?.remoteConfigured || !migration?.pending?.count"
            @click="startMigration"
          >
            {{ migrationTask?.running ? '迁移中…' : '一键迁移到远端' }}
          </button>
          <button v-if="migrationTask?.running" class="btn" type="button" :disabled="migrationBusy" @click="cancelMigration">停止</button>
        </div>
        <p class="field-hint">
          迁移往远端加一份，本站磁盘上的文件原样保留：玩家走浏览器直连远端下载失败时，
          主站会自动改用本地副本（见下面第 05 节的直连开关），远端出问题也不影响开局。
        </p>
        <p v-if="migrationError" class="remote-test-result">{{ migrationError }}</p>
        <details v-if="migrationTask?.errors?.length" class="migrate-errors">
          <summary>查看失败明细（{{ migrationTask.errors.length }} 条）</summary>
          <ul>
            <li v-for="entry in migrationTask.errors" :key="entry.id">
              <strong>#{{ entry.id }} {{ entry.title }}</strong>：{{ entry.error }}
            </li>
          </ul>
        </details>
      </div>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">05</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">下载地址（浏览器直连）</h3>
            <p class="site-block-desc">让玩家的浏览器直接从远端下载 ROM，减少本站出口流量。</p>
          </div>
        </div>
        <div class="site-fields">
          <div class="field">
            <label class="label" for="remote-download-url">远端下载地址</label>
            <input id="remote-download-url" v-model.trim="form.remoteDownloadUrl" class="input" maxlength="200" placeholder="https://rom.example.com" />
          </div>
          <div class="field">
            <label class="label" for="remote-download-secret">下载签名密钥</label>
            <input id="remote-download-secret" v-model.trim="form.remoteDownloadSecret" class="input" type="password" autocomplete="new-password" maxlength="256" placeholder="和远端 DOWNLOAD_SECRET 一致" />
          </div>
        </div>
        <label class="toggle-row">
          <div class="toggle-text">
            <div class="tr-t">ROM 由浏览器直连远端下载</div>
            <div class="tr-s">开启后，主站在校验权限后返回 302，文件不再经过本站出口；直连失败（远端不可用、网络不通）时浏览器会自动改回本站读本地副本</div>
          </div>
          <div class="toggle-sw">
            <input type="checkbox" v-model="form.romDirectEnabled" />
            <span class="sw-track"><span class="sw-thumb"></span></span>
          </div>
        </label>
        <p class="field-hint">下载地址必须能被玩家的浏览器打开（HTTPS）。上传密钥和下载密钥是两个独立的凭据，冒号后面不要填错。</p>
      </div>

      <div class="site-block">
        <div class="site-block-head">
          <span class="site-block-index" aria-hidden="true">06</span>
          <div class="site-block-heading">
            <h3 class="site-block-title">核心资源（远端托管）</h3>
            <p class="site-block-desc">从独立资源服务器加载模拟器核心，降低本站静态资源带宽消耗。</p>
          </div>
        </div>
        <label class="toggle-row">
          <div class="toggle-text">
            <div class="tr-t">启用远端核心托管</div>
            <div class="tr-s">开启后，模拟器核心由下面的资源服务器直供；关闭或地址不可用时自动回到本站 <code>/api/cores</code></div>
          </div>
          <div class="toggle-sw">
            <input type="checkbox" v-model="form.coresRemoteEnabled" />
            <span class="sw-track"><span class="sw-thumb"></span></span>
          </div>
        </label>
        <div class="field">
          <label class="label" for="cores-base-url">远端核心地址</label>
          <input id="cores-base-url" v-model.trim="form.coresBaseUrl" class="input" maxlength="200" placeholder="https://cores.example.com/releases" />
          <p class="field-hint">
            必须能被玩家的浏览器打开（HTTPS，且该站要允许跨域读取）。
          </p>
        </div>
        <div class="field">
          <label class="label">连通性测试</label>
          <div class="remote-test">
            <button class="btn" type="button" :disabled="testingCores" @click="testCores">
              {{ testingCores ? '测试中…' : '测试远端核心' }}
            </button>
            <span v-if="coresTestResult" class="remote-test-result" :class="{ ok: coresTestResult.ok }">
              {{ coresTestResult.text }}
            </span>
          </div>
          <p class="field-hint">用当前浏览器直接访问远端：验证 HTTPS/跨域、发布版本是否对得上、核心文件与 gzip 预压缩副本是否就绪。改完地址先测一次再保存。</p>
        </div>
      </div>

      <div class="site-actions">
        <div class="site-status">
          <Transition name="saved">
            <span v-if="siteSaved" class="saved">已保存</span>
          </Transition>
        </div>
        <button class="btn btn-primary site-save" :disabled="savingSite" @click="saveSite">
          {{ savingSite ? '保存中…' : '保存' }}
        </button>
      </div>
    </section>

    <section v-if="tab === 'users'" class="panel-card panel">
      <h2 class="panel-title">用户列表</h2>
      <div class="tbl">
        <div class="trow trow-head">
          <div>用户名</div><div>角色</div><div>注册时间</div><div class="right">操作</div>
        </div>
        <div v-for="u in users" :key="u.id" class="trow">
          <div class="u-name">
            <div class="avatar">{{ u.username.slice(0, 1).toUpperCase() }}</div>
            <span>{{ u.username }}</span>
          </div>
          <div>
            <span class="pill-tag" :class="u.role === 'admin' ? 'pill-admin' : 'pill-member'">
              {{ u.role === 'admin' ? '管理员' : '用户' }}
            </span>
          </div>
          <div class="muted">{{ formatServerDateTime(u.createdAt) }}</div>
          <div class="actions">
            <template v-if="u.id !== me.id">
              <button class="btn btn-sm" @click="toggleRole(u)">
                {{ u.role === 'admin' ? '降为用户' : '设为管理员' }}
              </button>
              <button class="btn btn-sm btn-danger" @click="removeUser(u)">删除</button>
            </template>
            <span v-else class="muted">（当前账号）</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="tab === 'roms'" class="panel-card panel">
      <div class="panel-head">
        <h2 class="panel-title">全部 ROM</h2>
        <button class="btn btn-primary btn-sm" @click="openUpload">上传</button>
      </div>
      <div class="rom-toolbar">
        <div class="rom-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input v-model.trim="adminRomSearch" placeholder="搜索 ROM、文件名或上传者" />
        </div>
        <ClaySelect
          v-model="adminRomPlatform"
          class="filter-select"
          aria-label="筛选平台"
          :options="adminRomPlatformSelectOptions"
        />
        <ClaySelect
          v-model="adminRomVisibility"
          class="filter-select"
          aria-label="筛选状态"
          :options="adminVisibilitySelectOptions"
        />
      </div>

      <div v-if="!filteredAdminRoms.length" class="empty-state">没有匹配的 ROM</div>
      <div v-else class="admin-rom-list">
        <article v-for="r in pagedAdminRoms" :key="r.id" class="admin-rom-entry">
          <div class="admin-rom-main">
            <RomCover :rom="r" class="entry-cover" />
            <div class="admin-rom-title-wrap">
              <div class="rt">{{ r.title }}</div>
              <div class="rf">{{ r.fileName }} · {{ fmtSize(r.fileSize) }}</div>
            </div>
          </div>
          <div class="admin-rom-meta">
            <div class="admin-rom-facts">
              <span class="plat-badge" :style="{ '--pc': platColor(r.platform) }">{{ platLabel(r.platform) }}</span>
              <span v-if="r.storage === 'remote'" class="meta-chip chip-remote" title="文件存放在远端存储服务器">远端</span>
              <span v-if="r.parentRomId" class="meta-chip">{{ r.versionLabel || '变体' }}</span>
              <span class="meta-chip">@{{ r.owner?.username || '—' }}</span>
              <span class="meta-chip time-chip">{{ formatServerDateTime(r.createdAt) }}</span>
            </div>

            <div class="admin-rom-settings">
              <div class="rom-control rom-control-players">
                <span class="rom-control-label">游玩人数</span>
                <ClaySelect
                  class="admin-select max-player-select"
                  flat
                  aria-label="游玩人数"
                  :model-value="r.maxPlayers ?? ''"
                  :disabled="savingMaxPlayersId === r.id"
                  :options="maxPlayerOptionsFor(r)"
                  @change="updateMaxPlayers(r, $event)"
                />
              </div>
              <div class="rom-control rom-control-core">
                <span class="rom-control-label">核心</span>
                <ClaySelect
                  class="admin-select compat-select"
                  flat
                  aria-label="默认核心"
                  :model-value="r.defaultCore ?? ''"
                  :disabled="savingCompatId === r.id"
                  :options="coreSelectOptionsFor(r)"
                  @change="updateDefaultCore(r, $event)"
                />
              </div>
            </div>

            <div class="admin-rom-actions">
              <button
                class="visibility-switch"
                :class="{ active: r.isPublic }"
                :disabled="togglingId === r.id"
                @click="togglePublic(r)"
                :title="r.isPublic ? '点击设为私密' : '点击设为公开'"
              >
                <span class="switch-label private-label">私密</span>
                <span class="switch-track"><span class="switch-thumb"></span></span>
                <span class="switch-label public-label">公开</span>
              </button>
              <div class="actions">
                <button class="btn btn-sm" @click="editRom(r)">编辑</button>
                <button class="btn btn-sm" @click="openCheats(r)"><span class="cheat-ico" aria-hidden="true">✦</span>金手指{{ r.cheatCount ? ` ${r.cheatCount}` : '' }}</button>
                <button class="btn btn-sm" @click="play(r)">试玩</button>
                <button class="btn btn-sm btn-danger" @click="deleteRom(r)">删除</button>
              </div>
            </div>
          </div>
        </article>
      </div>

      <ClayPagination
        v-if="filteredAdminRoms.length > pageSize"
        v-model="adminRomPage"
        :page-count="adminRomPageCount"
        aria-label="管理 ROM 分页"
      />
    </section>

    <section v-if="tab === 'bios'" class="panel-card panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">BIOS 文件</h2>
          <p class="panel-sub">当前只列出运行时会加载的 BIOS 目录；文件来自服务器的 <code>data/bios/&lt;platform&gt;</code>。</p>
        </div>
        <button class="btn btn-sm" :disabled="biosLoading" @click="loadBios">
          {{ biosLoading ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <div v-if="biosLoading && !biosItems.length" class="empty-state">正在读取 BIOS 列表…</div>
      <div v-else class="bios-grid">
        <article v-for="item in biosItems" :key="item.platform" class="bios-card">
          <header class="bios-head">
            <div>
              <div class="bios-title">
                <span class="pdot" :style="{ background: platColor(item.platform) }"></span>
                {{ item.label }}
              </div>
              <div class="bios-path">data/bios/{{ item.platform }}</div>
            </div>
            <span class="pill-tag" :class="item.missing.length ? 'pill-warn' : 'pill-pub'">
              {{ item.files.length }}/{{ item.required.length }}
            </span>
          </header>

          <div class="bios-files">
            <div v-for="file in item.files" :key="file.name" class="bios-file">
              <span class="bios-name">{{ file.name }}</span>
              <span class="muted">{{ fmtSize(file.size) }}</span>
            </div>
            <div v-if="!item.files.length" class="muted">目录为空或不存在</div>
          </div>

          <div v-if="item.missing.length" class="bios-missing">
            缺少：{{ item.missing.join('、') }}
          </div>
          <div v-else class="bios-ok">必需文件已就绪</div>
        </article>
      </div>
    </section>

    <UploadDialog v-if="showUpload" @close="showUpload = false" @uploaded="onUploaded" />
    <EditRomDialog v-if="editingRom" :rom="editingRom" @close="editingRom = null" @saved="onRomSaved" />
    <RomCheatsDialog
      v-if="cheatRom"
      :rom="cheatRom"
      @close="cheatRom = null"
      @saved="onCheatsSaved"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api/client.js'
import { useAuth } from '../composables/useAuth.js'
import { useAppDialog } from '../composables/useAppDialog.js'
import { useSettings } from '../composables/useSettings.js'
import { loadRuntimeConfig } from '../composables/runtimeConfig.js'
import { formatServerDateTime } from '../composables/formatTime.js'
import { testStunIce } from '../composables/useIceGatheringTest.js'
import { getPlatform, platformFacets, resolvePlatformId } from '../constants/platforms.js'
import { coreDisplayName } from '../constants/cores.js'
import UploadDialog from '../components/UploadDialog.vue'
import EditRomDialog from '../components/EditRomDialog.vue'
import RomCheatsDialog from '../components/RomCheatsDialog.vue'
import ClaySelect from '../components/ClaySelect.vue'
import RomCover from '../components/RomCover.vue'
import ClayPagination from '../components/ClayPagination.vue'

const router = useRouter()
const { showConfirm, showAlert } = useAppDialog()
const { user: me } = useAuth()
const { updateLocal } = useSettings()

const tab = ref('site')
const form = reactive({
  siteTitle: '',
  siteSubtitle: '',
  netplayEnabled: true,
  guestPlayEnabled: false,
  userUploadEnabled: true,
  webrtcStunUrls: '',
  webrtcTurnUrls: '',
  webrtcTurnUsername: '',
  webrtcTurnCredential: '',
  webrtcTurnSecret: '',
  webrtcTurnTtl: '',
  remoteUploadUrl: '',
  remoteUploadToken: '',
  remoteDownloadUrl: '',
  remoteDownloadSecret: '',
  romDirectEnabled: false,
  coresRemoteEnabled: false,
  coresBaseUrl: '',
})
const savingSite = ref(false)
const siteSaved = ref(false)
const testingRemote = ref(false)
const remoteTestResult = ref(null)
const testingStun = ref(false)
const stunTestResult = ref(null)
const testingTurn = ref(false)
const turnTestResult = ref(null)
const testingCores = ref(false)
const coresTestResult = ref(null)

// 本地 ROM 一键迁移：状态从服务端拉，运行时每 1.5 秒轮询一次。
const migration = ref(null)
const migrationBusy = ref(false)
const migrationError = ref('')
let migrationPoll = null
const migrationTask = computed(() => migration.value?.task || null)
const migratePercent = computed(() => {
  const task = migrationTask.value
  if (!task?.total) return 0
  return Math.min(100, Math.round((task.processed / task.total) * 100))
})
const pendingText = computed(() => {
  const pending = migration.value?.pending
  if (!pending) return '读取中…'
  return `${pending.count} 个 · ${fmtSize(pending.bytes)}`
})
const localCopiesText = computed(() => {
  const copies = migration.value?.localCopies
  if (!copies) return '读取中…'
  return `${copies.count} 个 · ${fmtSize(copies.bytes)}`
})

const users = ref([])
const roms = ref([])
const biosItems = ref([])
const biosLoading = ref(false)
const showUpload = ref(false)
const pageSize = 10
const adminRomSearch = ref('')
const adminRomPlatform = ref('all')
const adminRomVisibility = ref('all')
const adminRomPage = ref(1)

// 平台筛选项：一台游戏机一项（中文 + 英文），只列真上传过的机器。区域别名
// （famicom / snes / genesis）已经并到通用名上，同一台机器不会出现两项。
const adminRomPlatformOptions = computed(() => platformFacets(roms.value))
const adminRomPlatformSelectOptions = computed(() => [
  { value: 'all', label: '全部平台' },
  ...adminRomPlatformOptions.value.map((p) => ({ value: p.id, label: p.label })),
])
// 状态下拉框：公开状态（公开 / 私密）之外，还能按文件存放位置筛（远端 / 本地，
// 看 storage 字段，条目上那个「远端」小标签用的就是它）。
const adminVisibilitySelectOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'public', label: '公开' },
  { value: 'private', label: '私密' },
  { value: 'remote', label: '远端' },
  { value: 'local', label: '本地' },
]
function maxPlayerOptionsFor(rom) {
  return [
    { value: '', label: `自动（${rom.effectiveMaxPlayers || 4}P）` },
    ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}P` })),
  ]
}
function coreSelectOptionsFor(rom) {
  return [
    { value: '', label: '默认核心' },
    ...coreOptionsFor(rom.platform).map((core) => ({ value: core, label: coreDisplayName[core] || core })),
  ]
}
const filteredAdminRoms = computed(() => {
  const q = adminRomSearch.value.trim().toLowerCase()
  return roms.value
    .filter((rom) => adminRomPlatform.value === 'all' || resolvePlatformId(rom.platform) === adminRomPlatform.value)
    .filter((rom) => {
      if (adminRomVisibility.value === 'public') return !!rom.isPublic
      if (adminRomVisibility.value === 'private') return !rom.isPublic
      if (adminRomVisibility.value === 'remote') return rom.storage === 'remote'
      if (adminRomVisibility.value === 'local') return rom.storage !== 'remote'
      return true
    })
    .filter((rom) => {
      if (!q) return true
      return `${rom.title || ''} ${rom.fileName || ''} ${rom.owner?.username || ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
})
const adminRomPageCount = computed(() => Math.max(1, Math.ceil(filteredAdminRoms.value.length / pageSize)))
const pagedAdminRoms = computed(() => {
  const start = (adminRomPage.value - 1) * pageSize
  return filteredAdminRoms.value.slice(start, start + pageSize)
})

const publicRomCount = computed(() => roms.value.filter((r) => r.isPublic).length)
const adminCount = computed(() => users.value.filter((u) => u.role === 'admin').length)

watch([adminRomSearch, adminRomPlatform, adminRomVisibility], () => { adminRomPage.value = 1 })
watch(adminRomPageCount, (count) => {
  if (adminRomPage.value > count) adminRomPage.value = count
})

// 切到「远端」页签时拉一次迁移状态：打开页面就能看到待迁移统计，
// 正在跑的任务也会接着轮询（离开页签停轮询，避免后台空转）。
watch(tab, (value) => {
  if (value === 'remote') loadMigrationStatus()
  else stopMigrationPolling()
})
onBeforeUnmount(stopMigrationPolling)

onMounted(async () => {
  loadUsers(); loadRoms(); loadBios()
  try {
    const s = await api.adminSettings()
    form.siteTitle = s.siteTitle || ''
    form.siteSubtitle = s.siteSubtitle || ''
    form.netplayEnabled = s.netplayEnabled === '1'
    form.guestPlayEnabled = s.guestPlayEnabled === '1'
    form.userUploadEnabled = s.userUploadEnabled !== '0'
    form.webrtcStunUrls = s.webrtcStunUrls || ''
    form.webrtcTurnUrls = s.webrtcTurnUrls || ''
    form.webrtcTurnUsername = s.webrtcTurnUsername || ''
    form.webrtcTurnCredential = s.webrtcTurnCredential || ''
    form.webrtcTurnSecret = s.webrtcTurnSecret || ''
    form.webrtcTurnTtl = s.webrtcTurnTtl || ''
    form.remoteUploadUrl = s.remoteUploadUrl || ''
    form.remoteUploadToken = s.remoteUploadToken || ''
    form.remoteDownloadUrl = s.remoteDownloadUrl || ''
    form.remoteDownloadSecret = s.remoteDownloadSecret || ''
    form.romDirectEnabled = s.romDirectEnabled === '1'
    // 远端核心：地址与开关是两个独立设置。老数据只有地址（没有开关字段）时按
    // 地址推断：有地址 = 开启，none 或空 = 关闭。
    const savedCoresBaseUrl = String(s.coresBaseUrl || '')
    const coresEnabledRaw = String(s.coresRemoteEnabled ?? '').trim()
    const legacyCoresEnabled = !!savedCoresBaseUrl && savedCoresBaseUrl !== 'none'
    form.coresBaseUrl = legacyCoresEnabled ? savedCoresBaseUrl : ''
    form.coresRemoteEnabled = coresEnabledRaw === '1' ? true : coresEnabledRaw === '0' ? false : legacyCoresEnabled
  } catch {}
})

// 测试 STUN：先让后端发真实 STUN 请求（能确定服务器本身是否可用），
// 再用当前浏览器按同样地址做一次 ICE 采集（确认配置能被浏览器接受）。
async function testStun() {
  testingStun.value = true
  stunTestResult.value = null
  try {
    const listed = form.webrtcStunUrls.split(/[,\r\n]+/).map((url) => url.trim()).filter(Boolean)
    const server = await api.adminTestStun({ stunUrls: form.webrtcStunUrls })
    const probes = Array.isArray(server?.probes) ? server.probes : []

    // 服务端探测一句话结论 + 每个地址的详情
    const lines = []
    if (server?.ok) lines.push(`服务器探测：${server.summary}${server.averageLatencyMs != null ? `，平均 ${server.averageLatencyMs}ms` : ''}`)
    for (const probe of probes) {
      const target = `${probe.url}（${probe.transport || 'UDP'}）`
      if (probe.ok) {
        lines.push(`✓ ${target} ${probe.latencyMs}ms · 解析到 ${probe.resolved} · 出口地址 ${probe.mapped}`)
      } else {
        lines.push(`✗ ${target} ${probe.error}`)
      }
    }
    if (!lines.length) lines.push(`服务器探测失败：${server?.error || '后端没有返回结果'}`)

    // 浏览器侧：本机能否按这份配置采集到 ICE 候选
    const ice = await testStunIce(listed)
    lines.push(ice.ok
      ? `本机浏览器：ICE 采集正常（${ice.candidates} 个候选地址）`
      : `本机浏览器：${ice.error}`)

    stunTestResult.value = { ok: !!server?.ok, text: lines.join('\n') }
  } catch (err) {
    stunTestResult.value = { ok: false, text: err?.message || '测试失败' }
  } finally {
    testingStun.value = false
  }
}

// 测试 TURN 中继：用表单里的地址/用户名/密码直接测（未保存也能测）。
// 填了凭据 → 真的分配一次中继端口；没填 → 只判断中继端口是否可达（401/438 即正常）。
async function testTurn() {
  testingTurn.value = true
  turnTestResult.value = null
  try {
    const res = await api.adminTestTurn({
      turnUrls: form.webrtcTurnUrls,
      turnUsername: form.webrtcTurnUsername,
      turnCredential: form.webrtcTurnCredential,
      turnSecret: form.webrtcTurnSecret,
      turnTtl: form.webrtcTurnTtl,
    })
    const probes = Array.isArray(res?.probes) ? res.probes : []
    const lines = []
    for (const probe of probes) {
      const target = `${probe.url}（${probe.transport || 'UDP'}）`
      if (probe.ok) {
        const extra = probe.relay
          ? ` · 中继地址 ${probe.relay}${probe.mapped ? ` · 出口 ${probe.mapped}` : ''}`
          : ` · ${probe.note || '可用'}${probe.realm ? ` · realm=${probe.realm}` : ''}`
        lines.push(`✓ ${target} ${probe.latencyMs}ms${extra}`)
      } else {
        lines.push(`✗ ${target} ${probe.error}`)
      }
    }
    if (!lines.length) lines.push(res?.error || '后端没有返回结果')
    if (res?.mode === 'ephemeral') {
      lines.push('本次用共享密钥现签了一份临时凭据去测（coturn 配置正确才会成功）')
    } else if (res?.mode === 'static') {
      lines.push('本次用静态用户名 + 密码去测；建议改成共享密钥，避免长期密码被匿名抓走')
    } else if (res?.ok) {
      lines.push('提示：没填 TURN 凭据，本次只验证了端口可达；填入共享密钥后才能验证中继分配')
    }
    turnTestResult.value = { ok: !!res?.ok, text: lines.join('\n') }
  } catch (err) {
    turnTestResult.value = { ok: false, text: err?.message || '测试失败' }
  } finally {
    testingTurn.value = false
  }
}

// 用当前表单里的地址/密钥测试远端服务，未保存的值也能先测
async function testRemote() {
  testingRemote.value = true
  remoteTestResult.value = null
  try {
    const res = await api.adminTestRemote({ url: form.remoteUploadUrl, token: form.remoteUploadToken })
    if (res?.ok === false || !res?.health) {
      remoteTestResult.value = { ok: false, text: res?.error || '远端服务返回异常' }
      return
    }
    const h = res.health
    const parts = [
      `连接正常（${h.latencyMs ?? '?'}ms）`,
      h.writable === false ? '存储目录不可写' : '存储目录可写',
      `${h.files ?? 0} 个文件`,
      h.freeBytes != null ? `剩余 ${fmtSize(h.freeBytes)}` : null,
    ].filter(Boolean)
    remoteTestResult.value = { ok: true, text: parts.join(' · ') }
  } catch (err) {
    remoteTestResult.value = { ok: false, text: err?.message || '测试失败' }
  } finally {
    testingRemote.value = false
  }
}

// ── 本地 ROM 一键迁移到远端存储 ─────────────────────────────────────────
// 任务在服务端后台跑（逐个上传 + 校验 + 更新记录），这里只负责触发与轮询展示。
function stopMigrationPolling() {
  if (migrationPoll) {
    clearInterval(migrationPoll)
    migrationPoll = null
  }
}

function startMigrationPolling() {
  if (migrationPoll) return
  migrationPoll = setInterval(() => { loadMigrationStatus({ quiet: true }) }, 1500)
}

async function loadMigrationStatus({ quiet = false } = {}) {
  if (!quiet) migrationBusy.value = true
  try {
    const data = await api.adminRomRemoteMigration()
    migration.value = data
    migrationError.value = ''
    if (data?.task?.running) startMigrationPolling()
    else stopMigrationPolling()
  } catch (err) {
    if (!quiet) migrationError.value = err?.message || '读取迁移状态失败'
  } finally {
    if (!quiet) migrationBusy.value = false
  }
}

async function startMigration() {
  const pending = migration.value?.pending
  if (!await showConfirm(
    `把本站磁盘上的 ${pending?.count ?? ''} 个 ROM（约 ${fmtSize(pending?.bytes || 0)}）逐个迁移到远端存储？\n迁移期间可以随时停止，已完成的记录不受影响；本地文件会保留作兜底。`,
    { title: '一键迁移到远端', confirmText: '开始迁移' },
  )) return
  migrationBusy.value = true
  try {
    const res = await api.adminStartRomRemoteMigration()
    if (res?.overview) migration.value = res.overview
    if (res?.started) startMigrationPolling()
    else if (res?.reason === 'empty') await showAlert('没有需要迁移的本地 ROM')
    else if (res?.reason === 'running') await showAlert('已经有一次迁移在跑，请等它结束或先停止')
  } catch (err) {
    await showAlert(err?.message || '启动迁移失败')
  } finally {
    migrationBusy.value = false
  }
}

async function cancelMigration() {
  migrationBusy.value = true
  try {
    const res = await api.adminCancelRomRemoteMigration()
    if (res?.overview) migration.value = res.overview
  } catch (err) {
    await showAlert(err?.message || '停止迁移失败')
  } finally {
    migrationBusy.value = false
  }
  await loadMigrationStatus({ quiet: true })
}

// 测试远端核心资源：必须用浏览器实测。HTTPS、跨域许可、证书这些问题只有浏览器
// 视角才能发现——服务端探测一直通，前端却可能因为 CORS 拿不到一个字节。
async function testCores() {
  testingCores.value = true
  coresTestResult.value = null
  try {
    const base = String(form.coresBaseUrl || '').trim().replace(/\/+$/, '')
    if (!base) {
      coresTestResult.value = { ok: false, text: '还没填远端核心地址' }
      return
    }

    // 本站当前的发布版本：远端必须和它一致，否则浏览器会一直回退到本机。
    const manifestRes = await fetch('/api/cores/manifest', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    const manifest = await manifestRes.json().catch(() => null)
    const release = manifest?.release || ''
    const lines = []
    if (!release) {
      lines.push('本站还没有发布版本：先在服务器上执行 node deploy/build-cores.mjs')
    }

    let versionMatches = false
    let fileOk = false
    let remoteFiles = null
    if (release) {
      const res = await fetch(`${base}/${release}/manifest.json`, { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      remoteFiles = body?.files || null
      lines.push(`公开发布清单：HTTP ${res.status}`)
      if (body?.release === release) {
        versionMatches = true
        lines.push(`版本一致：${release}，${Object.keys(remoteFiles || {}).length} 个文件`)
      } else if (body?.release) {
        lines.push(`版本不一致：远端 ${body.release}，本站 ${release}（远端需要重新同步）`)
      } else {
        lines.push('远端没有可读的 manifest.json：目录结构或同步有问题')
      }

      const sample = Object.keys(remoteFiles || {}).find((name) => name.endsWith('.wasm'))
      if (sample) {
        const head = await fetch(`${base}/${release}/${sample}`, { method: 'HEAD' })
        fileOk = head.ok
        const parts = [`HTTP ${head.status}`, head.headers.get('content-type') || 'content-type ?']
        const encoding = head.headers.get('content-encoding')
        const length = Number(head.headers.get('content-length'))
        if (encoding) parts.push(`content-encoding: ${encoding}`)
        const meta = remoteFiles?.[sample]
        if (Number.isFinite(length)) {
          if (encoding && meta?.gzipSize && Math.abs(length - meta.gzipSize) <= 64) {
            parts.push(`命中 gzip 预压缩副本（${fmtSize(length)}）`)
          } else if (meta?.size && length === meta.size) {
            parts.push(`按未压缩直出（${fmtSize(length)}，建议开启 gzip_static）`)
          } else {
            parts.push(fmtSize(length))
          }
        }
        lines.push(`${sample}：${parts.join(' · ')}`)
      } else {
        lines.push('清单里没有 .wasm 文件，无法抽样检查')
      }
    }

    coresTestResult.value = { ok: versionMatches && fileOk, text: lines.join('\n') }
  } catch (err) {
    // 跨域被拦时 fetch 只会抛 TypeError，这里把常见原因写清楚，省得去猜。
    coresTestResult.value = {
      ok: false,
      text: `浏览器访问失败：${err?.message || err}\n常见原因：地址不是 HTTPS、证书不被信任、资源站没有返回 Access-Control-Allow-Origin，或被 HSTS 强制升级。`,
    }
  } finally {
    testingCores.value = false
  }
}

async function saveSite() {
  savingSite.value = true
  siteSaved.value = false
  // 地址与开关分开保存：地址随时可以填、可以改（开关关着也照存），开关只决定这份
  // 地址是否投入使用。关闭时存 0，压过环境变量里的旧值；下次要用直接打开开关即可。
  const coresBaseUrl = String(form.coresBaseUrl || '').trim()
  if (form.coresRemoteEnabled && !coresBaseUrl) {
    savingSite.value = false
    await showAlert('开启远端核心托管需要先填写远端核心地址')
    return
  }
  try {
    const next = await api.adminUpdateSettings({
      siteTitle: form.siteTitle,
      siteSubtitle: form.siteSubtitle,
      netplayEnabled: form.netplayEnabled,
      guestPlayEnabled: form.guestPlayEnabled,
      userUploadEnabled: form.userUploadEnabled,
      webrtcStunUrls: form.webrtcStunUrls,
      webrtcTurnUrls: form.webrtcTurnUrls,
      webrtcTurnUsername: form.webrtcTurnUsername,
      webrtcTurnCredential: form.webrtcTurnCredential,
      webrtcTurnSecret: form.webrtcTurnSecret,
      webrtcTurnTtl: form.webrtcTurnTtl,
      remoteUploadUrl: form.remoteUploadUrl,
      remoteUploadToken: form.remoteUploadToken,
      remoteDownloadUrl: form.remoteDownloadUrl,
      remoteDownloadSecret: form.remoteDownloadSecret,
      romDirectEnabled: form.romDirectEnabled,
      coresBaseUrl,
      coresRemoteEnabled: form.coresRemoteEnabled ? '1' : '0',
    })
    form.webrtcStunUrls = next.webrtcStunUrls || ''
    form.webrtcTurnUrls = next.webrtcTurnUrls || ''
    form.webrtcTurnUsername = next.webrtcTurnUsername || ''
    form.webrtcTurnCredential = next.webrtcTurnCredential || ''
    form.webrtcTurnSecret = next.webrtcTurnSecret || ''
    form.webrtcTurnTtl = next.webrtcTurnTtl || ''
    form.remoteUploadUrl = next.remoteUploadUrl || ''
    form.remoteUploadToken = next.remoteUploadToken || ''
    form.remoteDownloadUrl = next.remoteDownloadUrl || ''
    form.remoteDownloadSecret = next.remoteDownloadSecret || ''
    form.romDirectEnabled = next.romDirectEnabled === '1'
    const nextCoresBaseUrl = String(next.coresBaseUrl || '')
    const nextCoresFlag = String(next.coresRemoteEnabled ?? '').trim()
    const nextLegacyCoresEnabled = !!nextCoresBaseUrl && nextCoresBaseUrl !== 'none'
    form.coresBaseUrl = nextLegacyCoresEnabled ? nextCoresBaseUrl : ''
    form.coresRemoteEnabled = nextCoresFlag === '1' ? true : nextCoresFlag === '0' ? false : nextLegacyCoresEnabled
    // 重新拉一次运行时配置：走临时凭据时用户名/密码是服务端现签的，不能拿表单里的
    // 静态值顶上；核心地址的生效值同样以服务端计算的结果为准。
    await loadRuntimeConfig()
    updateLocal({
      siteTitle: next.siteTitle,
      siteSubtitle: next.siteSubtitle,
      netplayEnabled: next.netplayEnabled === '1',
      guestPlayEnabled: next.guestPlayEnabled === '1',
      userUploadEnabled: next.userUploadEnabled !== '0',
      remoteUploadAvailable: !!(next.remoteUploadUrl && next.remoteUploadToken),
    })
    siteSaved.value = true
    setTimeout(() => { siteSaved.value = false }, 1600)
  } catch (err) { await showAlert(err?.message || '保存失败') }
  finally { savingSite.value = false }
}

async function loadUsers() { try { users.value = (await api.adminUsers()).users } catch {} }
async function loadRoms()  { try { roms.value  = (await api.adminRoms()).roms   } catch {} }
async function loadBios() {
  biosLoading.value = true
  try {
    biosItems.value = (await api.adminBios()).bios || []
  } catch (err) {
    await showAlert(err?.message || '读取 BIOS 列表失败')
  } finally {
    biosLoading.value = false
  }
}

async function toggleRole(u) {
  const nextRole = u.role === 'admin' ? 'user' : 'admin'
  if (!await showConfirm(`确认将 ${u.username} 设为 ${nextRole === 'admin' ? '管理员' : '普通用户'}？`, {
    title: '修改用户角色', confirmText: '确认修改',
  })) return
  try {
    const updated = await api.adminUpdateUser(u.id, { role: nextRole })
    u.role = updated.role
  } catch (err) { await showAlert(err.message) }
}

async function removeUser(u) {
  if (!await showConfirm(`删除用户 ${u.username} 及其所有 ROM？该操作不可撤销。`, {
    title: '删除用户', confirmText: '删除用户', danger: true,
  })) return
  try {
    await api.adminDeleteUser(u.id)
    users.value = users.value.filter((x) => x.id !== u.id)
    loadRoms()
  } catch (err) { await showAlert(err.message) }
}

function openUpload() { showUpload.value = true }
function onUploaded() {
  loadRoms()
  showUpload.value = false
}

async function deleteRom(r) {
  if (!await showConfirm(`删除 "${r.title}"？将移至回收站，用户可在「我的 ROM」里恢复。`, {
    title: '删除 ROM', confirmText: '移至回收站', danger: true,
  })) return
  try {
    await api.romDelete(r.id)
    await loadRoms()
  } catch (err) {
    await showAlert(err?.message || '删除失败')
  }
}

const togglingId = ref(null)
const savingMaxPlayersId = ref(null)
const savingCompatId = ref(null)
const editingRom = ref(null)
const cheatRom = ref(null)

function editRom(r) { editingRom.value = r }

function openCheats(r) { cheatRom.value = r }

// The dialog returns the fresh list; mirror the count in the list badge.
function onCheatsSaved(cheats) {
  const rom = cheatRom.value
  if (rom) rom.cheatCount = cheats.length
  cheatRom.value = null
}

function onRomSaved() {
  editingRom.value = null
  loadRoms()
}
async function togglePublic(r) {
  togglingId.value = r.id
  try {
    await api.romUpdate(r.id, { isPublic: !r.isPublic })
    await loadRoms()
  } catch (err) {
    await showAlert(err?.message || '切换失败')
  } finally {
    togglingId.value = null
  }
}

async function updateMaxPlayers(r, value) {
  savingMaxPlayersId.value = r.id
  try {
    const maxPlayers = value === '' ? null : Number(value)
    await api.romUpdate(r.id, { maxPlayers })
    await loadRoms()
  } catch (err) {
    await showAlert(err?.message || '保存人数失败')
  } finally {
    savingMaxPlayersId.value = null
  }
}

async function updateDefaultCore(r, value) {
  savingCompatId.value = r.id
  const nextDefaultCore = value || null
  try {
    const updated = await api.romUpdate(r.id, { defaultCore: nextDefaultCore })
    Object.assign(r, {
      ...updated,
      defaultCore: updated.defaultCore ?? nextDefaultCore,
      owner: r.owner,
    })
  } catch (err) {
    await showAlert(err?.message || '保存核心失败')
  } finally {
    savingCompatId.value = null
  }
}

function coreOptionsFor(platform) {
  return getPlatform(platform).cores || []
}

function play(r) { router.push(`/play/${r.id}`) }
function platColor(p) { return getPlatform(p).color }
function platLabel(p) { return getPlatform(p).shortLabel }
function fmtSize(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}
</script>

<style scoped>
.admin { max-width: 960px; }

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: var(--clay-surface);
  border: 0;
  border-radius: var(--r-xl);
  box-shadow: var(--clay-card);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.stat-card:hover {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}

.stat-icon {
  width: 46px; height: 46px;
  border-radius: var(--r-md);
  border: 0;
  background: var(--clay-inset-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--clay-in-sm);
}
.icon-blue   { color: var(--ink-blue); }
.icon-orange { color: var(--ink-orange); }
.icon-green  { color: var(--ink-green); }
.icon-purple { color: var(--ink-purple); }

.stat-body { min-width: 0; }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-bottom: 2px; font-weight: 900; }
.stat-value {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.admin-seg { max-width: 100%; margin-bottom: 20px; }
.admin-seg .seg-btn { flex-shrink: 0; white-space: nowrap; }

.panel {
  padding: 24px;
  /* 面板本身做成“托盘”，内部的 ROM 条目/开关才是粘土卡片，避免卡片嵌套 */
  background: rgba(255, 255, 255, 0.55);
  box-shadow: var(--clay-in-sm);
}
.panel-title { font-size: 16px; font-weight: 900; margin: 0 0 16px; color: var(--text-primary); }
.panel-sub { margin: 4px 0 0; color: var(--text-tertiary); font-size: 12px; line-height: 1.6; }
.panel-sub code {
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  border: 0;
  color: var(--text-primary);
  box-shadow: var(--clay-xs);
  font-family: ui-monospace, 'SF Mono', monospace;
}
.panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 16px; }

/* 站点与远端设置：每个功能独立成分组，标题、说明、字段各自有明确层级 */
.panel-site { padding: 28px; }
.panel-site .panel-title {
  margin: 0 0 20px;
  font-size: 18px;
  line-height: 1.3;
}
.site-block {
  margin: 0;
  padding: 22px 22px 24px;
  border-radius: var(--r-xl);
  background: rgba(255, 255, 255, 0.48);
  box-shadow: var(--clay-in-sm);
}
.site-block + .site-block { margin-top: 18px; }
.site-block-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  background: linear-gradient(90deg, rgba(78, 51, 72, 0.14), rgba(78, 51, 72, 0)) 0 100% / 100% 1px no-repeat;
}
.site-block-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: var(--clay-lilac);
  color: var(--text-lilac);
  box-shadow: var(--clay-xs);
  font-family: var(--mono-stack);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.site-block-heading { min-width: 0; flex: 1; }
.site-block-title {
  margin: 1px 0 3px;
  font-size: 16px;
  line-height: 1.3;
  font-weight: 900;
  color: var(--text-primary);
}
.site-block-desc {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}
.site-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
}
.site-block .field { margin: 0; max-width: none; }
.site-block .label {
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.3;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.site-block .field + .site-fields,
.site-block .site-fields + .field,
.site-block > .field + .field { margin-top: 18px; }
.site-block > .toggle-row + .field,
.site-block > .site-fields + .toggle-row { margin-top: 18px; }
.field-hint {
  margin: 8px 2px 0;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}
.field-hint code {
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-primary);
  font-family: var(--mono-stack);
  font-size: 11px;
}

/* 远端测试：按钮是动作，说明和结果保持在同一行但不抢标题层级 */
.remote-test { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-height: 44px; }
.site-block > .remote-test,
.site-block .field > .remote-test { margin-top: 16px; }
.remote-test-result {
  font-size: 12px;
  font-weight: 800;
  color: var(--error);
  line-height: 1.5;
}
.remote-test-result.ok { color: var(--success); }

/* 一键迁移：两栏统计 + 细进度条 + 失败明细 */
.migrate-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.migrate-fact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: var(--r-lg);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.mf-label { color: var(--text-tertiary); font-size: 12px; font-weight: 800; }
.mf-value { color: var(--text-primary); font-size: 15px; font-weight: 900; }
.migrate-progress {
  margin-top: 16px;
  height: 10px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
  overflow: hidden;
}
.mp-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--ink-purple), var(--ink-pink));
  transition: width 0.3s var(--ease-out);
}
.migrate-line {
  margin: 10px 2px 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}
.migrate-errors { margin-top: 12px; color: var(--text-secondary); font-size: 12px; }
.migrate-errors summary { cursor: pointer; font-weight: 800; }
.migrate-errors ul {
  margin: 8px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
}
.migrate-errors li { line-height: 1.6; overflow-wrap: anywhere; }

/* STUN 测试：每个地址一行结果 */
.stun-test-result {
  margin-top: 10px;
  white-space: pre-line;
  font-weight: 700;
}
.stun-test-note { margin: 0; }

.toggle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.toggle-row {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  margin: 0;
  min-height: 78px;
  padding: 15px 16px;
  background: rgba(255, 255, 255, 0.72);
  border: 0;
  border-radius: var(--r-lg);
  cursor: pointer;
  max-width: none;
  box-shadow: var(--clay-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.toggle-row:hover { transform: var(--clay-lift); box-shadow: var(--clay-lift-shadow); }
.toggle-row:active { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press); }
.toggle-text { min-width: 0; }
.toggle-sw { position: relative; flex-shrink: 0; }
.toggle-sw input { position: absolute; inset: 0; opacity: 0; cursor: pointer; margin: 0; }
.sw-track {
  display: block; width: 44px; height: 26px;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  border: 0;
  position: relative;
  box-shadow: var(--clay-in-sm);
  transition: background var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.sw-thumb {
  position: absolute; top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: var(--clay-primary-grad);
  border-radius: var(--r-pill);
  box-shadow: var(--clay-xs);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.toggle-row:active .sw-thumb { transform: scaleX(1.08) scaleY(0.9); }
.toggle-sw input:checked + .sw-track { background: var(--clay-primary-grad); box-shadow: var(--clay-sm); }
.toggle-sw input:checked + .sw-track .sw-thumb { background: var(--clay-surface-flat); transform: translateX(18px); }
.toggle-row:active .toggle-sw input:checked + .sw-track .sw-thumb { transform: translateX(18px) scaleX(1.08) scaleY(0.9); }
.tr-t { font-size: 13px; line-height: 1.35; font-weight: 900; color: var(--text-primary); }
.tr-s { font-size: 11.5px; line-height: 1.5; color: var(--text-tertiary); margin-top: 4px; }

.site-actions {
  display: flex;
  flex-direction: column;
  margin-top: 22px;
  padding-top: 18px;
  background: linear-gradient(90deg, rgba(78, 51, 72, 0.12), rgba(78, 51, 72, 0)) 0 0 / 100% 1px no-repeat;
}
.site-status { display: flex; align-items: center; justify-content: center; min-height: 22px; }
.site-save { width: 100%; height: 48px; font-size: 15px; }
.saved { color: var(--success); font-size: 13px; font-weight: 900; }
.saved-enter-active, .saved-leave-active { transition: all var(--t) var(--clay-ease); }
.saved-enter-from, .saved-leave-to { opacity: 0; transform: translateY(4px); }

.rom-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px 140px;
  gap: 10px;
  margin-bottom: 16px;
}
.rom-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-primary);
  box-shadow: var(--clay-in-sm);
}
.rom-search input {
  width: 100%;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-weight: 800;
}
.rom-search input::placeholder { color: var(--text-quaternary); }
.filter-select {
  --select-width: 100%;
  --select-height: 40px;
  --select-min-height: 40px;
  --select-font-size: 13px;
}
.admin-rom-list { display: flex; flex-direction: column; gap: 14px; }
.admin-rom-entry {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 0;
  border-radius: var(--r-xl);
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.admin-rom-entry:hover {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.admin-rom-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.admin-rom-title-wrap { min-width: 0; flex: 1; }
.admin-rom-meta {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(260px, 1.2fr) auto;
  align-items: center;
  gap: 12px;
  padding-left: 22px;
}
.admin-rom-facts,
.admin-rom-settings,
.admin-rom-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.admin-rom-settings {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.admin-rom-actions {
  justify-content: flex-end;
}
.time-chip {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-remote { color: var(--ink-purple); background: var(--clay-lilac); }
.meta-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 11px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-surface-flat);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 900;
  box-shadow: var(--clay-xs);
}
.tbl { display: flex; flex-direction: column; gap: 2px; }
.trow {
  display: grid;
  grid-template-columns: 2fr 1fr 1.2fr 180px;
  gap: 14px;
  align-items: center;
  padding: 12px 16px;
  border-radius: var(--r-md);
  transition: background var(--t-fast) var(--clay-ease), box-shadow var(--t-fast) var(--clay-ease);
}
.trow-roms { grid-template-columns: 2fr 110px 1fr 120px 160px 90px 170px; }
.trow:not(.trow-head):hover { background: rgba(255, 255, 255, 0.72); box-shadow: var(--clay-sm); }
.trow-head {
  font-size: 12px; font-weight: 900; color: var(--text-secondary);
  padding: 12px 16px;
  border-bottom: 0;
  border-radius: var(--r-md);
  background: var(--clay-inset-surface);
  box-shadow: var(--clay-in-sm);
}
.right { text-align: right; }

.u-name { display: flex; align-items: center; gap: 12px; min-width: 0; }
.avatar {
  width: 34px; height: 34px;
  border-radius: var(--r-pill);
  background: var(--clay-lilac);
  border: 0;
  color: var(--text-lilac);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 900;
  flex-shrink: 0;
  box-shadow: var(--clay-xs);
}
.pdot { width: 10px; height: 10px; margin-top: 7px; border-radius: 14px; flex-shrink: 0; border: 0; }
/* ROM 条目的封面（无封面时是默认卡带 SVG） */
.entry-cover { --cover-size: 46px; }
.rt { font-size: 16px; font-weight: 900; color: var(--text-primary); overflow-wrap: anywhere; word-break: break-word; }
.rf { font-size: 12px; color: var(--text-tertiary); margin-top: 4px; overflow-wrap: anywhere; }
.muted { color: var(--text-tertiary); font-size: 13px; }

.actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.cheat-ico { margin-right: 4px; color: var(--accent); }
.rom-control {
  display: inline-flex;
  align-items: stretch;
  width: 220px;
  height: 34px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  overflow: hidden;
  box-shadow: var(--clay-in-sm);
}
.rom-control-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 70px;
  padding: 0 8px;
  background: var(--clay-primary-grad);
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  white-space: nowrap;
}
.admin-select {
  flex: 1;
  min-width: 0;
  --select-width: 100%;
  --select-height: 100%;
  --select-min-height: 0;
  --select-padding: 0 26px 0 10px;
  --select-font-size: 12px;
  --select-arrow-right: 9px;
  /* 嵌在托盘里的选择框只用焦点环提示，不做位移 */
  --select-focus-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.08), 0 0 0 3px var(--accent-ring);
}
.pill-tag {
  display: inline-flex; align-items: center;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 900;
  border: 0;
  background: var(--clay-surface-flat);
  box-shadow: var(--clay-xs);
}
.pill-admin  { color: var(--ink-pink); }
.pill-member { color: var(--text-secondary); }
.pill-pub    { color: var(--success); }
.pill-priv   { color: var(--text-tertiary); }
.pill-warn   { color: var(--warn); }

.bios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
.bios-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: var(--r-xl);
  border: 0;
  background: var(--clay-surface);
  box-shadow: var(--clay-card);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.bios-card:hover {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.bios-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.bios-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 900;
  color: var(--text-primary);
}
.bios-path {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 11px;
}
.bios-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 28px;
}
.bios-file {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--r-md);
  background: var(--clay-inset-surface);
  border: 0;
  box-shadow: var(--clay-in-sm);
}
.bios-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, 'SF Mono', monospace;
  font-size: 12px;
  color: var(--text-primary);
}
.bios-ok,
.bios-missing,
.empty-state {
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 0;
  background: var(--clay-surface-flat);
  font-size: 12px;
  line-height: 1.5;
  box-shadow: var(--clay-xs);
}
.bios-ok { color: var(--success); }
.bios-missing { color: var(--warn); }
.empty-state { color: var(--text-tertiary); }

.visibility-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--r-pill);
  background: var(--clay-inset-surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 11px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: var(--clay-in-sm);
  transition: transform var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease), opacity var(--t) var(--clay-ease);
}
.visibility-switch:hover:not(:disabled) {
  transform: var(--clay-lift);
  box-shadow: var(--clay-lift-shadow);
}
.visibility-switch:active:not(:disabled) { transform: translateY(2px) var(--clay-squash); box-shadow: var(--clay-press-sm); }
.visibility-switch:disabled {
  opacity: 0.6;
  cursor: wait;
}
.switch-track {
  display: inline-flex;
  align-items: center;
  width: 40px;
  height: 24px;
  padding: 2px;
  border: 0;
  border-radius: var(--r-pill);
  background: rgba(94, 58, 84, 0.12);
  box-shadow: var(--clay-in-sm);
  transition: background var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.switch-thumb {
  width: 16px;
  height: 16px;
  border-radius: var(--r-pill);
  background: var(--clay-primary-grad);
  box-shadow: var(--clay-xs);
  transition: transform var(--t) var(--clay-ease), background var(--t) var(--clay-ease), box-shadow var(--t) var(--clay-ease);
}
.visibility-switch:active:not(:disabled) .switch-thumb { transform: scaleX(1.08) scaleY(0.9); }
.visibility-switch.active .switch-track { background: var(--clay-primary-grad); }
.visibility-switch.active .switch-thumb {
  background: var(--clay-surface-flat);
  transform: translateX(18px);
}
.visibility-switch.active:active:not(:disabled) .switch-thumb {
  transform: translateX(18px) scaleX(1.08) scaleY(0.9);
}
.switch-label { color: var(--text-tertiary); }
.visibility-switch:not(.active) .private-label { color: var(--text-primary); }
.visibility-switch.active .public-label { color: var(--success); }

.plat-badge {
  --pc: var(--accent);
  display: inline-flex; align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 900;
  background: color-mix(in srgb, var(--pc) 16%, #fff);
  border: 0;
  /* 平台色只做浅底，文字混入深梅子保证浅底上 ≥ 4.5:1 */
  color: color-mix(in srgb, var(--pc) 40%, var(--clay-ink));
  box-shadow: var(--clay-xs);
}

@media (max-width: 900px) {
  .panel-site { padding: 20px 16px 18px; }
  .site-block { padding: 18px 16px 20px; }
  .site-block-head { gap: 10px; margin-bottom: 16px; padding-bottom: 14px; }
  .site-block-index { flex-basis: 30px; width: 30px; height: 30px; }
  .site-block-title { font-size: 15px; }
  .site-fields { grid-template-columns: minmax(0, 1fr); }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .rom-toolbar { grid-template-columns: 1fr; }
  .admin-rom-meta {
    grid-template-columns: 1fr;
    padding-left: 0;
    align-items: stretch;
  }
  .admin-rom-facts,
  .admin-rom-settings,
  .admin-rom-actions {
    justify-content: flex-start;
  }
  .admin-rom-actions {
    padding-top: 2px;
  }
  .rom-control { width: min(220px, 100%); }
  .actions { justify-content: flex-start; }
  .trow, .trow-roms { grid-template-columns: 1fr 1fr; gap: 10px; }
  .trow > div:nth-child(n+3), .trow-head > div:nth-child(n+3) { display: none; }
}
</style>
