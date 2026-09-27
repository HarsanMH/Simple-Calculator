const DEFAULT_CATEGORIES=["From Marketplace","Server Utility","Redstone","Farming","PVP","Combat","Survival","Utility","World Generation","Mobs","Weapons","Armor","Tools","Magic","Economy","Minigame","UI","Shader","Texture","Optimization","Adventure","Building","Decoration","Transportation","Other"];
let CATEGORIES=[...DEFAULT_CATEGORIES];
const cfg=window.FUYUKO_SUPABASE||{};
const backendReady=Boolean(window.supabase&&cfg.url&&cfg.anonKey&&!/YOUR-PROJECT|YOUR-PUBLISHABLE/i.test(cfg.url+cfg.anonKey));
const sb=backendReady?window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
let currentUser=null,currentProfile=null,currentAddon=null,selectedRating=0;
let pinnedAddons=[],pinnedIndex=0,pinnedTimer=null;
let publicRequestsCache=[],myRequestsCache=[],myBugsCache=[],allUsersCache=[];
let cropImage=null,cropState={x:0,y:0,zoom:1,drag:false,sx:0,sy:0,ox:0,oy:0};
const $=id=>document.getElementById(id);
const esc=(s="")=>String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const norm=p=>String(p||"").trim().replace(/^\/+/,"");
function asset(p){return norm(p);}
function storageAsset(bucket,p){const path=norm(p);if(!path||validHttpUrl(path))return path;try{return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl||path}catch{return path}}
function forceDownloadUrl(url,name){if(!url)return "";const sep=url.includes("?")?"&":"?";return url+sep+"download="+encodeURIComponent(name||"addon");}
function validHttpUrl(v){try{const u=new URL(String(v||""));return u.protocol==="https:"||u.protocol==="http:"}catch{return false}}
function releaseButton(r,addonId){const mode=r?.download_mode||"download_here";if(mode==="external_link"){return r?.download_url?`<button class="btn small orange" onclick="goToAddonLink('${r.id}')">Go to link</button>`:`<button class="btn small" disabled>Link belum ada</button>`}return `<button class="btn small" onclick="downloadAddon('${addonId}','${r.id}')">Download</button>`}
const iso=()=>new Date().toISOString();
function toast(msg,error=false){const t=$("toast");t.textContent=msg;t.className="toast show"+(error?" error":"");clearTimeout(toast.t);toast.t=setTimeout(()=>{t.textContent="";t.className="toast"},2800)}
function requireBackend(){if(!backendReady){toast("Supabase belum dikonfigurasi.",true);return false}return true}
function requireAuth(){if(!currentUser){toast("Login diperlukan.",true);openAuth();return false}return true}
function requireAdmin(){if(!currentProfile||currentProfile.role!=="admin"){toast("Akses admin diperlukan.",true);return false}return true}
function usernameEmail(u){return `${String(u).trim().toLowerCase()}@login.fuyuko.web.id`}
function fmt(v){return v?new Date(v).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}):"-"}
function fmtDateOnly(v){return v?new Date(v).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}):"-"}
function initials(p){return String(p?.display_name||p?.username||"F").slice(0,1).toUpperCase()}
function userNameHTML(p){const n=esc(p?.display_name||p?.username||"User"), admin=p?.role==="admin";return `<b class="user-name${admin?" admin-name":""}">${n}</b>`}
function usernameHTML(p){const n=esc(p?.username||"user"), admin=p?.role==="admin";return `<span class="username-label${admin?" admin-name":""}">@${n}</span>`}
function avatarHTML(p,size=""){return p?.avatar_url?`<div class="avatar ${size}"><img src="${esc(p.avatar_url)}" alt=""></div>`:`<div class="avatar ${size}">${esc(initials(p))}</div>`}
function starHTML(value=0){let out="";for(let i=0;i<5;i++){const fill=Math.max(0,Math.min(1,Number(value)-i));out+=`<span class="star" style="--fill:${fill*100}%">★</span>`}return `<span class="five-stars" aria-label="${Number(value).toFixed(1)}/5">${out}</span>`}
function ratingPickerHTML(){return `<div class="rating-picker">${[0,1,2,3,4].map(i=>`<span class="picker-star" style="--fill:${Math.max(0,Math.min(1,selectedRating-i))*100}%"><span>★</span><button class="half-btn left" onclick="setRating(${i+.5})" aria-label="${i+.5} bintang"></button><button class="half-btn right" onclick="setRating(${i+1})" aria-label="${i+1} bintang"></button></span>`).join("")}</div>`}
window.setRating=v=>{selectedRating=v;const el=$("ratingPicker");if(el)el.innerHTML=ratingPickerHTML()+`<span class="rating-value">${v.toFixed(1)}/5</span>`};
function avgRating(a){const vals=(a._ratings||[]).map(x=>Number(x.rating));return vals.length?Math.round(vals.reduce((s,n)=>s+n,0)/vals.length*2)/2:0}
function latestRelease(a){return (a.addon_releases||[]).slice().sort((x,y)=>new Date(y.created_at)-new Date(x.created_at))[0]||null}
function sortAddons(a){return [...a].sort((x,y)=>new Date(y.updated_at||y.created_at)-new Date(x.updated_at||x.created_at))}
async function getProfiles(ids){if(!sb||!ids.length)return{};const uniq=[...new Set(ids.filter(Boolean))];if(!uniq.length)return{};const {data}=await sb.from("profiles").select("id,username,display_name,avatar_url,role,created_at").in("id",uniq);return Object.fromEntries((data||[]).map(x=>[x.id,x]))}
async function getProfileById(id){const m=await getProfiles([id]);return m[id]||null}
async function uploadPublic(bucket,file,path){const up=await sb.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type||undefined});if(up.error)throw up.error;return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl}

async function loadSiteCategories(){if(!sb)return;const {data,error}=await sb.from("site_settings").select("categories").eq("id",1).maybeSingle();if(error)return;const custom=Array.isArray(data?.categories)?data.categories:[];CATEGORIES=[...new Set([...DEFAULT_CATEGORIES,...custom.map(x=>String(x).trim()).filter(Boolean)])]}
async function saveSiteCategories(){if(!requireAdmin())return false;const custom=CATEGORIES.filter(x=>!DEFAULT_CATEGORIES.includes(x));const {error}=await sb.from("site_settings").upsert({id:1,categories:custom,updated_at:iso()},{onConflict:"id"});if(error){toast(error.message,true);return false}return true}
function renderCategoryAdmin(){const custom=CATEGORIES.filter(x=>!DEFAULT_CATEGORIES.includes(x));$("categoryAdminList").innerHTML=(custom.length?custom:[]).map(c=>`<div class="admin-item"><div><b>${esc(c)}</b><div class="muted">Custom category</div></div><button class="btn small danger" onclick="deleteCategory('${esc(c).replace(/'/g,"\'")}')">Hapus</button></div>`).join("")||'<p class="muted">Belum ada kategori custom. Kategori default tetap tersedia.</p>'}
window.deleteCategory=async name=>{if(!requireAdmin()||!confirm(`Hapus kategori "${name}"?`))return;CATEGORIES=CATEGORIES.filter(x=>x!==name);if(!await saveSiteCategories())return;renderCategoryChoices([]);renderCategoryAdmin();await loadAddons();toast("Kategori dihapus")};
async function loadAdminOthers(){if(!requireAdmin())return;await loadSiteCategories();renderCategoryAdmin();renderCategoryChoices([])}

function showSetup(){const b=$("setupBanner");if(backendReady)b.classList.add("hidden");else{b.classList.remove("hidden");b.innerHTML='<b>Backend belum dikonfigurasi.</b> Isi <code>supabase-config.js</code> dengan URL + publishable key Supabase.'}}
function openAuth(tab="login"){$("authModal").classList.remove("hidden");document.querySelectorAll("[data-auth]").forEach(x=>x.classList.toggle("active",x.dataset.auth===tab));$("loginForm").classList.toggle("hidden",tab!=="login");$("registerForm").classList.toggle("hidden",tab!=="register")}
function showPage(id){document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));const p=$(id);if(!p)return;p.classList.add("active");$("nav").classList.remove("open");window.scrollTo(0,0);if(id==="home")renderFeatured();if(id==="addons")loadAddons();if(id==="detail"&&currentAddon)renderDetail(currentAddon);if(id==="requests")loadRequestsPage();if(id==="bugReport")loadBugPage();if(id==="donate")loadDonate();if(id==="announcements")loadAnnouncements();if(id==="profile")renderProfile();if(id==="admin")loadAdmin()}
document.addEventListener("click",e=>{const x=e.target.closest("[data-page]");if(x){e.preventDefault();showPage(x.dataset.page)}});
$("menuBtn").onclick=()=>$("nav").classList.toggle("open");
$("loginBtn").onclick=()=>currentUser?showPage("profile"):openAuth();
async function doLogout(){if(sb)await sb.auth.signOut();currentUser=null;currentProfile=null;updateNav();showPage("home");toast("Berhasil logout")}
$("profileLogoutBtn").onclick=doLogout;
$("closeAuth").onclick=()=>$("authModal").classList.add("hidden");document.querySelectorAll("[data-auth]").forEach(b=>b.onclick=()=>openAuth(b.dataset.auth));
function updateNav(){const ok=!!currentUser;document.querySelectorAll(".auth-only").forEach(x=>x.classList.toggle("hidden",!ok));document.querySelectorAll(".admin-only").forEach(x=>x.classList.toggle("hidden",currentProfile?.role!=="admin"));const b=$("loginBtn");b.classList.remove("hidden");if(ok){b.className="header-auth logged-in";b.innerHTML=`${usernameHTML(currentProfile||{})}`;b.title="Buka Profile"}else{b.className="header-auth";b.textContent="Login / Register";b.title="Login / Register"}document.querySelectorAll(".auth-required-action").forEach(x=>x.classList.toggle("hidden",!ok))}
async function refreshUser(session){currentUser=session?.user||null;currentProfile=currentUser?await getProfileById(currentUser.id):null;updateNav();if(currentProfile)renderProfile()}
if(sb){sb.auth.getSession().then(({data})=>{refreshUser(data.session);renderFeatured()});sb.auth.onAuthStateChange((_e,s)=>refreshUser(s))}else{renderFeatured()}

async function handleLogin(e){e.preventDefault();if(!requireBackend())return;const u=$("loginUser").value.trim(),p=$("loginPass").value;if(!u||!p)return;const {error}=await sb.auth.signInWithPassword({email:usernameEmail(u),password:p});if(error)return toast(error.message||"Login gagal.",true);$("authModal").classList.add("hidden");e.target.reset();toast("Login berhasil")}
async function handleRegister(e){e.preventDefault();if(!requireBackend())return;const u=$("regUser").value.trim(),p=$("regPass").value,n=$("regName").value.trim()||u;if(!/^[a-zA-Z0-9_.-]{3,24}$/.test(u))return toast("Username hanya boleh huruf, angka, _, ., -",true);const {data,error}=await sb.auth.signUp({email:usernameEmail(u),password:p,options:{data:{username:u,display_name:n}}});if(error)return toast(error.message||"Register gagal.",true);if(!data.session){toast("Akun dibuat. Pastikan auto-confirm email aktif di Supabase Auth.")}else toast("Akun berhasil dibuat");$("authModal").classList.add("hidden");e.target.reset()}
$("loginForm").onsubmit=handleLogin;$("registerForm").onsubmit=handleRegister;

let addonFetchFailed=false; async function fetchAddons(){if(!sb)return[];const {data,error}=await sb.from("addons").select("*,addon_releases(*)").order("updated_at",{ascending:false}).range(0,9999);if(error){addonFetchFailed=true;toast(error.message,true);return[]} addonFetchFailed=false;const ids=(data||[]).map(x=>x.id);if(!ids.length)return[];const {data:ratings}=await sb.from("ratings").select("addon_id,user_id,rating").in("addon_id",ids).range(0,9999);const rm={};(ratings||[]).forEach(x=>(rm[x.addon_id]??=[]).push(x));return (data||[]).map(x=>({...x,_ratings:rm[x.id]||[]}))}
function isNew(a){const t=new Date(a.updated_at||a.created_at).getTime();return Number.isFinite(t)&&Date.now()-t<86400000}
function addonCard(a){const r=latestRelease(a),src=asset(a.image_path);const tags=(a.tags||[]).slice(0,3).map(x=>`<span class="tag">${esc(x)}</span>`).join("");const thumb=src?`<img src="${esc(src)}" alt="${esc(a.name)}" onerror="this.style.display='none';this.parentElement.classList.add('broken-thumb')">`:`<span class="image-fallback">FW</span>`;return `<article class="card"><div class="thumb">${thumb}<span class="image-fallback">FW</span>${isNew(a)?'<span class="update-badge">UPDATE BARU</span>':''}</div><div class="card-body"><div class="tags">${tags}</div><h3>${esc(a.name)}</h3><p class="muted clamp">${esc(a.description||"")}</p><div class="rating">${starHTML(avgRating(a))}<span class="muted">${avgRating(a).toFixed(1)} (${a._ratings?.length||0})</span></div><div class="tags"><span class="tag">MC ${esc(r?.mc_version||"-")}</span><span class="tag">v${esc(r?.version||"-")}</span></div><p class="muted addon-date">Uploaded ${fmtDateOnly(a.created_at)} · Last Update ${fmtDateOnly(a.updated_at||a.created_at)}</p><div class="card-footer"><span class="muted">${a.downloads||0} downloads</span><button class="btn small" onclick="openAddon('${a.id}')">Details</button></div></div></article>`}
function renderPinnedHero(list){
  const hero=$("pinnedHero");
  if(!hero)return;
  clearInterval(pinnedTimer);
  pinnedTimer=null;

  const nextPinned=(Array.isArray(list)?list:[]).filter(a=>a?.is_pinned===true);
  pinnedAddons=nextPinned;
  pinnedIndex=0;

  const showDefault=()=>{
    hero.classList.remove("pinned-active","pinned-slide-in");
    hero.classList.remove("pinned-loading");
    hero.onclick=null;
    hero.onkeydown=null;
    hero.removeAttribute("role");
    hero.removeAttribute("tabindex");
    hero.style.removeProperty("--pinned-slide");
    hero.innerHTML=`<div class="pinned-default-content">
      <div class="pinned-default-glow"></div>
      <div class="pinned-default-snowflake" aria-hidden="true">❄️</div>
      <p>Bedrock Addon Hub</p>
    </div>`;
  };

  if(!pinnedAddons.length){
    showDefault();
    return;
  }

  hero.classList.add("pinned-active");
  hero.classList.remove("pinned-loading");
  let pinnedDirection=1;

  const draw=()=>{
    const a=pinnedAddons[pinnedIndex%pinnedAddons.length];
    const src=asset(a.image_path);
    hero.onclick=()=>openAddon(a.id);
    hero.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openAddon(a.id)}};
    hero.setAttribute("role","button");
    hero.setAttribute("tabindex","0");

    hero.classList.remove("pinned-slide-in");
    void hero.offsetWidth;
    hero.style.setProperty("--pinned-slide",pinnedDirection>0?"48px":"-48px");
    hero.classList.add("pinned-slide-in");

    const desc=(a.description||"Deskripsi addon belum tersedia.").replace(/\s+/g," ").trim();
    hero.innerHTML=`
      <div class="pinned-v3-shell">
        <div class="pinned-v3-image">
          ${src?`<img src="${esc(src)}" alt="${esc(a.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`:''}
          <div class="pinned-v3-fallback" style="display:${src?'none':'grid'}">❄️</div>
          <div class="pinned-v3-heading">
            <div class="pinned-v3-kicker">PINNED ADDON</div>
            <div class="pinned-v3-name">${esc(a.name)}</div>
          </div>
        </div>
        <div class="pinned-v3-description">${esc(desc)}</div>
        <div class="pinned-v3-meta">
          <span>Updated ${fmtDateOnly(a.updated_at||a.created_at)}</span>
          <span>Uploaded ${fmtDateOnly(a.created_at)}</span>
          <span>${a.downloads||0} downloads</span>
          <span>${avgRating(a).toFixed(1)}/5 rating</span>
        </div>
      </div>`;
    pinnedDirection*=-1;
    pinnedIndex=(pinnedIndex+1)%pinnedAddons.length;
  };

  draw();
  if(pinnedAddons.length>1)pinnedTimer=setInterval(draw,5000);
}
let featuredRenderToken=0; async function renderFeatured(){const token=++featuredRenderToken;const raw=await fetchAddons();if(token!==featuredRenderToken)return;if(addonFetchFailed){return}const list=sortAddons(raw);renderPinnedHero(list);$("featuredGrid").innerHTML=list.slice(0,4).map(addonCard).join("")||"<p class='muted'>Belum ada addon.</p>"}
async function loadAddons(){const list=await fetchAddons();const cats=[...new Set(list.flatMap(x=>x.tags||[]))].sort();const vers=[...new Set(list.flatMap(x=>(x.addon_releases||[]).map(r=>r.mc_version).filter(Boolean)))].sort();$("categoryFilter").innerHTML='<option value="">All categories</option>'+cats.map(x=>`<option>${esc(x)}</option>`).join("");$("versionFilter").innerHTML='<option value="">All versions</option>'+vers.map(x=>`<option>${esc(x)}</option>`).join("");renderAddonResults(list)}
function renderAddonResults(list){const q=$("searchInput").value.trim().toLowerCase(),c=$("categoryFilter").value,v=$("versionFilter").value;const filtered=sortAddons(list).filter(a=>{const t=[a.name,a.description,(a.tags||[]).join(" "),...(a.addon_releases||[]).flatMap(r=>[r.version,r.mc_version,r.changelog])].join(" ").toLowerCase();return(!q||t.includes(q))&&(!c||(a.tags||[]).includes(c))&&(!v||(a.addon_releases||[]).some(r=>r.mc_version===v))});$("addonGrid").innerHTML=filtered.map(addonCard).join("")||"<p class='muted'>Addon tidak ditemukan.</p>"}
["searchInput","categoryFilter","versionFilter"].forEach(id=>$(id).addEventListener("input",async()=>renderAddonResults(await fetchAddons())));

async function openAddon(id){if(!sb)return;const {data,error}=await sb.from("addons").select("*,addon_releases(*)").eq("id",id).single();if(error)return toast(error.message,true);const {data:ratings}=await sb.from("ratings").select("user_id,rating").eq("addon_id",id).range(0,9999);const {data:comments}=await sb.from("comments").select("id,addon_id,user_id,parent_id,body,created_at,updated_at").eq("addon_id",id).order("created_at",{ascending:true}).range(0,9999);const pm=await getProfiles((comments||[]).map(x=>x.user_id));data._ratings=ratings||[];data._comments=(comments||[]).map(x=>({...x,profiles:pm[x.user_id]||null}));currentAddon=data;showPage("detail")}
function renderCommentTree(comments){const roots=comments.filter(x=>!x.parent_id),children=p=>comments.filter(x=>x.parent_id===p);const draw=c=>{const kids=children(c.id),own=c.user_id===currentUser?.id;return `<div class="comment-item"><div class="comment-row">${avatarHTML(c.profiles||{})}<div class="comment-main"><div class="comment-meta">${userNameHTML(c.profiles)}${usernameHTML(c.profiles)}<time>${fmt(c.created_at)}</time></div><p>${esc(c.body)}</p><div class="thread-tools"><button class="text-btn" onclick="toggleReplyBox('${c.id}')">Reply</button>${kids.length?`<button class="text-btn" onclick="toggleReplies('${c.id}')">Balasan (${kids.length})</button>`:""}${own?`<button class="text-btn" onclick="editAddonComment('${c.id}')">Edit</button><button class="text-btn danger-text" onclick="deleteAddonComment('${c.id}')">Hapus</button>`:""}</div><div id="replybox_${c.id}" class="reply-box hidden"><textarea class="input" id="replytext_${c.id}" rows="2" placeholder="Balas komentar..."></textarea><button class="btn small" onclick="replyAddonComment('${currentAddon.id}','${c.id}')">Balas</button></div><div id="replies_${c.id}" class="replies hidden">${kids.map(draw).join("")}</div></div></div></div>`};return roots.map(draw).join("")||'<p class="muted">Belum ada komentar.</p>'}
async function shareAddon(id,name){
  const url=new URL(window.location.href);
  url.search="";
  url.hash="";
  url.searchParams.set("addon",id);
  const shareUrl=url.toString();
  try{
    if(navigator.share){
      await navigator.share({title:name||"Fuyuko Web Addons",text:`Lihat addon ${name||"ini"} di Fuyuko Web Addons`,url:shareUrl});
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    toast("Link addon disalin");
  }catch(e){
    if(e?.name==="AbortError")return;
    try{
      const ta=document.createElement("textarea");ta.value=shareUrl;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();toast("Link addon disalin");
    }catch(_){toast(shareUrl);}
  }
}

function renderDetail(a){const avg=avgRating(a),mine=Number(a._ratings?.find(x=>x.user_id===currentUser?.id)?.rating||0),rels=(a.addon_releases||[]).slice().sort((x,y)=>new Date(y.created_at)-new Date(x.created_at));$("detailContent").innerHTML=`<div class="detail-hero"><div class="detail-thumb">${asset(a.image_path)?`<img src="${esc(asset(a.image_path))}" alt="">`:"FW"}</div><div><div class="tags">${(a.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div><h1>${esc(a.name)}</h1><p class="muted">${esc(a.description||"")}</p><div class="rating">${starHTML(avg)}<b>${avg.toFixed(1)}</b><span class="muted">${a._ratings?.length||0} rating</span></div><p class="muted">Author: ${esc(a.author||"Fuyuko Team")} · ${a.downloads||0} downloads · Last Update ${fmtDateOnly(a.updated_at||a.created_at)}</p>${a.video_url?`<p><a class="text-btn" href="${esc(a.video_url)}" target="_blank" rel="noopener">Watch video →</a></p>`:""}</div></div><div class="detail-grid"><div class="panel"><h2>Features</h2><div class="feature-list">${(a.features||[]).map(x=>`<span class="feature-pill">${esc(x)}</span>`).join("")||'<span class="muted">Belum ada data fitur.</span>'}</div></div><div class="panel"><h2>Download - Version</h2><div class="release-list">${rels.map(r=>`<div class="release-public"><div class="release-info"><div><b>v${esc(r.version)}</b> <span class="tag">MC ${esc(r.mc_version||"-")}</span><span class="tag">${r.download_mode==="external_link"?"From link":"Download here"}</span></div><div class="release-target"><span class="release-target-label">${r.download_mode==="external_link"?"Link download":"File addon"}</span><code>${esc(r.download_mode==="external_link"?(r.download_url||"-"):(r.file_name||r.file_path||"addon.mcpack"))}</code></div><p class="muted">${esc(r.changelog||"Tidak ada changelog")}</p></div>${releaseButton(r,a.id)}</div>`).join("")||'<p class="muted">Belum ada file.</p>'}</div></div></div><div class="panel"><h2>Rating</h2>${currentUser?`<div id="ratingPicker">${ratingPickerHTML()}</div><div class="rating-actions"><span class="rating-value">Rating kamu: ${mine?mine.toFixed(1)+"/5":"belum memberi rating"}</span><button class="btn small" onclick="saveRating('${a.id}')">Simpan Rating</button><button class="btn small share-btn" onclick="shareAddon('${a.id}','${esc(a.name)}')">Share</button></div>`:'<p class="muted">Login untuk memberi rating.</p>'}</div><div class="panel comments-panel"><div class="panel-head"><div><h2>Comments</h2><p class="muted">Balasan bisa dibuka/tutup.</p></div></div><div class="comment-list">${renderCommentTree(a._comments||[])}</div>${currentUser?`<div class="comment-compose"><textarea id="addonCommentText" class="input" rows="3" placeholder="Tulis komentar..."></textarea><button class="btn" onclick="postAddonComment('${a.id}')">Komentar</button></div>`:'<p class="muted">Login untuk berkomentar.</p>'}</div>`;selectedRating=mine}
window.toggleReplyBox=id=>$(`replybox_${id}`)?.classList.toggle("hidden");window.toggleReplies=id=>$(`replies_${id}`)?.classList.toggle("hidden");
window.postAddonComment=async id=>{if(!requireAuth())return;const body=$("addonCommentText").value.trim();if(!body)return;const {error}=await sb.from("comments").insert({addon_id:id,user_id:currentUser.id,body});if(error)return toast(error.message,true);await openAddon(id);toast("Komentar ditambahkan")}
window.replyAddonComment=async(id,parent)=>{if(!requireAuth())return;const body=$(`replytext_${parent}`)?.value.trim();if(!body)return;const {error}=await sb.from("comments").insert({addon_id:id,user_id:currentUser.id,parent_id:parent,body});if(error)return toast(error.message,true);await openAddon(id);toast("Balasan ditambahkan")}
window.editAddonComment=async id=>{if(!requireAuth())return;const {data:c}=await sb.from("comments").select("body,addon_id,user_id").eq("id",id).single();if(!c||c.user_id!==currentUser.id)return toast("Komentar tidak ditemukan.",true);const body=prompt("Edit komentar",c.body);if(body===null)return;const v=body.trim();if(!v)return toast("Komentar tidak boleh kosong.",true);const {error}=await sb.from("comments").update({body:v,updated_at:iso()}).eq("id",id).eq("user_id",currentUser.id);if(error)return toast(error.message,true);await openAddon(c.addon_id);toast("Komentar diperbarui")}
window.deleteAddonComment=async id=>{if(!requireAuth()||!confirm("Hapus komentar ini?"))return;const {data:c}=await sb.from("comments").select("addon_id,user_id").eq("id",id).single();if(!c||c.user_id!==currentUser.id)return toast("Komentar tidak ditemukan.",true);const {error}=await sb.from("comments").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return toast(error.message,true);await openAddon(c.addon_id);toast("Komentar dihapus")}
window.saveRating=async id=>{if(!requireAuth()||selectedRating<.5)return toast("Pilih 0.5 sampai 5 bintang.",true);const {error}=await sb.from("ratings").upsert({addon_id:id,user_id:currentUser.id,rating:selectedRating});if(error)return toast(error.message,true);await openAddon(id);toast("Rating tersimpan")}
window.downloadAddon=async(addonId,releaseId)=>{const {data,error}=await sb.from("addon_releases").select("file_path,file_name,download_mode,download_url").eq("id",releaseId).single();if(error)return toast(error.message,true);if((data.download_mode||"download_here")==="external_link")return window.goToAddonLink(releaseId);const path=data.file_path;if(!path)return toast("File belum disiapkan.",true);try{await sb.rpc("increment_download",{p_addon_id:addonId})}catch(_){}const url=forceDownloadUrl(storageAsset("addon-files",path),data.file_name||"addon.mcpack");const a=document.createElement("a");a.href=url;a.download=data.file_name||"addon.mcpack";a.rel="noopener";document.body.appendChild(a);a.click();a.remove();toast("Download dimulai")};window.goToAddonLink=async releaseId=>{const {data,error}=await sb.from("addon_releases").select("addon_id,download_mode,download_url").eq("id",releaseId).single();if(error)return toast(error.message,true);if(data.download_mode!=="external_link"||!validHttpUrl(data.download_url))return toast("Link download belum tersedia.",true);try{await sb.rpc("increment_download",{p_addon_id:data.addon_id})}catch(_){}window.open(data.download_url,"_blank","noopener,noreferrer")}

function selectedCategories(){return [...document.querySelectorAll("#categoryChoices input:checked")].map(x=>x.value)}
function renderCategoryChoices(sel=[]){$("categoryChoices").innerHTML=CATEGORIES.map(c=>`<label class="check-chip"><input type="checkbox" value="${esc(c)}" ${sel.includes(c)?"checked":""}><span>${esc(c)}</span></label>`).join("");updateCategorySummary()}
function updateCategorySummary(){const s=selectedCategories();$("categorySummary").textContent=s.length?`${s.length} kategori dipilih`:"Pilih kategori"}
$("categoryChoices").addEventListener("change",updateCategorySummary);document.querySelectorAll(".editor-toggle").forEach(b=>b.onclick=()=>{$(b.dataset.toggle)?.classList.toggle("collapsed");b.classList.toggle("open")});
function bindFileName(inputId,nameId,defaultText="Belum ada file"){const i=$(inputId);if(!i)return;i.addEventListener("change",()=>{$(nameId).textContent=i.files?.[0]?.name||defaultText})}
[["reqFile","reqFileName","Belum ada file"],["bugFile","bugFileName","Belum ada gambar"],["profileAvatarFile","profileAvatarName","Belum ada gambar"],["addonImageFile","addonImageName","Belum ada gambar"],["addonFile","addonFileName","Belum ada file"],["newReleaseFile","newReleaseFileName","Belum ada file"]].forEach(x=>bindFileName(...x));

function toggleReleaseDownloadUI(prefix){const mode=$(prefix+"DownloadMode")?.value||"download_here";$(prefix+"DownloadHere").classList.toggle("hidden",mode!=="download_here");$(prefix+"DownloadLink").classList.toggle("hidden",mode!=="external_link")}
$("addonDownloadMode").onchange=()=>toggleReleaseDownloadUI("addon");$("newReleaseDownloadMode").onchange=()=>toggleReleaseDownloadUI("newRelease");
function resetAddonForm(){$("addonForm").classList.add("hidden");$("editAddonId").value="";$("addonFormTitle").textContent="Tambah Addon Baru";$("addonFormHint").textContent="Info dasar addon dan file versi pertama.";["addonName","addonVideo","addonAuthor","addonDescription","addonFeatures","addonRelease","addonVersion","addonChangelog"].forEach(id=>$(id).value="");["addonImageFile","addonFile","newReleaseFile"].forEach(id=>$(id).value="");["addonImageName","addonFileName","newReleaseFileName"].forEach(id=>$(id).textContent="Belum ada file");$("addonDownloadMode").value="download_here";$("newReleaseDownloadMode").value="download_here";$("addonDownloadUrl").value="";$("newReleaseDownloadUrl").value="";toggleReleaseDownloadUI("addon");toggleReleaseDownloadUI("newRelease");renderCategoryChoices([]);$("releaseEditorSection").classList.add("hidden");$("initialReleaseSection").classList.remove("hidden");$("initialReleaseEditor").classList.remove("collapsed")}
$("showAddonForm").onclick=()=>{resetAddonForm();$("addonForm").classList.remove("hidden");window.scrollTo({top:220,behavior:"smooth"})};$("closeAddonForm").onclick=resetAddonForm;
async function buildAddonPayload(){return {name:$("addonName").value.trim(),tags:selectedCategories(),image_path:"",video_url:$("addonVideo").value.trim()||null,author:$("addonAuthor").value.trim()||"Fuyuko Team",description:$("addonDescription").value.trim(),features:$("addonFeatures").value.split(",").map(x=>x.trim()).filter(Boolean)}}
async function uploadAddonImage(file){if(!file)return null;if(!file.type.startsWith("image/"))throw new Error("Thumbnail harus berupa gambar.");if(file.size>5*1024*1024)throw new Error("Thumbnail maksimal 5 MB.");return await uploadPublic("addon-images",file,`${currentUser.id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`)}
async function uploadAddonFile(file,addonId){if(!file)throw new Error("Pilih file addon.");if(file.size>100*1024*1024)throw new Error("File addon maksimal 100 MB.");return await uploadPublic("addon-files",file,`${addonId}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`)}
$("createAddonBtn").onclick=async()=>{if(!requireAdmin())return;try{const p=await buildAddonPayload(),rel={version:$("addonRelease").value.trim()||"1.0.0",mc_version:$("addonVersion").value.trim(),changelog:$("addonChangelog").value.trim(),download_mode:$("addonDownloadMode").value||"download_here",download_url:$("addonDownloadUrl").value.trim()};const img=$("addonImageFile").files[0],file=$("addonFile").files[0];if(!p.name||!p.description||!p.tags.length||!rel.mc_version)return toast("Lengkapi info, kategori, dan versi Minecraft.",true);if(rel.download_mode==="download_here"&&!file)return toast("Pilih file addon untuk mode Download here.",true);if(rel.download_mode==="external_link"&&!validHttpUrl(rel.download_url))return toast("Masukkan link http/https yang valid.",true);const created=await sb.from("addons").insert({...p,created_by:currentUser.id,image_path:""}).select().single();if(created.error)throw created.error;const addonId=created.data.id;let imageUrl="";if(img||window.fuyukoSelectedGalleryImagePath)imageUrl=await uploadAddonImage(img);let fileUrl="",fileName=null;if(rel.download_mode==="download_here"){fileUrl=await uploadAddonFile(file,addonId);fileName=file.name}const rr=await sb.from("addon_releases").insert({addon_id:addonId,version:rel.version,mc_version:rel.mc_version,file_path:fileUrl,file_name:fileName,download_mode:rel.download_mode,download_url:rel.download_mode==="external_link"?rel.download_url:null,changelog:rel.changelog});if(rr.error)throw rr.error;const up=await sb.from("addons").update({image_path:imageUrl||"",updated_at:iso()}).eq("id",addonId);if(up.error)throw up.error;resetAddonForm();await loadAdmin();await renderFeatured();toast("Addon berhasil dibuat")}catch(e){toast(e.message||"Upload gagal.",true)}};
$("saveAddonInfoBtn").onclick=async()=>{if(!requireAdmin())return;const id=$("editAddonId").value;if(!id)return toast("Buat addon dulu.",true);try{const old=await sb.from("addons").select("image_path").eq("id",id).single();if(old.error)throw old.error;let image_path=old.data.image_path||"";const img=$("addonImageFile").files[0];if(img||window.fuyukoSelectedGalleryImagePath)image_path=await uploadAddonImage(img);const p=await buildAddonPayload();if(!p.name||!p.description||!p.tags.length)return toast("Nama, deskripsi, dan minimal satu tag wajib.",true);p.image_path=image_path;p.updated_at=iso();const {error}=await sb.from("addons").update(p).eq("id",id);if(error)throw error;await openAdminAddon(id);await renderFeatured();toast("Info addon disimpan")}catch(e){toast(e.message||"Gagal menyimpan.",true)}};
$("addVersionBtn").onclick=()=>{if(!requireAdmin())return;$("newVersionForm").classList.remove("hidden");$("newReleaseVersion").focus()};$("cancelNewVersionBtn").onclick=()=>{$("newVersionForm").classList.add("hidden")};
$("saveNewVersionBtn").onclick=async()=>{if(!requireAdmin())return;try{const id=$("editAddonId").value,version=$("newReleaseVersion").value.trim(),mc=$("newReleaseMc").value.trim(),file=$("newReleaseFile").files[0],changelog=$("newReleaseChangelog").value.trim(),download_mode=$("newReleaseDownloadMode").value||"download_here",download_url=$("newReleaseDownloadUrl").value.trim();if(!id||!version||!mc)return toast("Lengkapi versi dan Minecraft.",true);if(download_mode==="download_here"&&!file)return toast("Pilih file addon untuk mode Download here.",true);if(download_mode==="external_link"&&!validHttpUrl(download_url))return toast("Masukkan link http/https yang valid.",true);let url="",file_name=null;if(download_mode==="download_here"){url=await uploadAddonFile(file,id);file_name=file.name}const {error}=await sb.from("addon_releases").insert({addon_id:id,version,mc_version:mc,file_path:url,file_name,download_mode,download_url:download_mode==="external_link"?download_url:null,changelog});if(error)throw error;const touch=await sb.from("addons").update({updated_at:iso()}).eq("id",id);if(touch.error)throw touch.error;$("newVersionForm").classList.add("hidden");["newReleaseVersion","newReleaseMc","newReleaseChangelog"].forEach(id=>$(id).value="");$("newReleaseFile").value="";$("newReleaseFileName").textContent="Belum ada file";await openAdminAddon(id);toast("Versi baru ditambahkan")}catch(e){toast(e.message||"Upload gagal.",true)}};
window.deleteRelease=async id=>{if(!requireAdmin()||!confirm("Hapus versi ini dari database?"))return;const {data}=await sb.from("addon_releases").select("addon_id").eq("id",id).single();const {error}=await sb.from("addon_releases").delete().eq("id",id);if(error)return toast(error.message,true);if(data?.addon_id)await openAdminAddon(data.addon_id);toast("Versi dihapus")};window.deleteAddon=async id=>{if(!requireAdmin()||!confirm("Hapus addon beserta semua versi dan komentarnya?"))return;const {error}=await sb.from("addons").delete().eq("id",id);if(error)return toast(error.message,true);resetAddonForm();await loadAdmin();await renderFeatured();toast("Addon dihapus")};
window.openAdminAddon=async id=>{if(!requireAdmin())return;const {data,error}=await sb.from("addons").select("*,addon_releases(*)").eq("id",id).single();if(error)return toast(error.message,true);$("editAddonId").value=id;$("addonFormTitle").textContent=`Kelola / Update: ${data.name}`;$("addonFormHint").textContent="Editor hanya dibuka setelah menekan Kelola / Update.";$("addonName").value=data.name;$("addonVideo").value=data.video_url||"";$("addonAuthor").value=data.author||"";$("addonDescription").value=data.description||"";$("addonFeatures").value=(data.features||[]).join(", ");$("addonImageName").textContent=data.image_path?"Thumbnail saat ini tersimpan":"Belum ada gambar";renderCategoryChoices(data.tags||[]);$("initialReleaseSection").classList.add("hidden");$("releaseEditorSection").classList.remove("hidden");$("newVersionForm").classList.add("hidden");$("newReleaseDownloadMode").value="download_here";$("newReleaseDownloadUrl").value="";$("newReleaseFile").value="";$("newReleaseFileName").textContent="Belum ada file";toggleReleaseDownloadUI("newRelease");renderVersionManager(data);$("addonForm").classList.remove("hidden");$("addonForm").scrollIntoView({behavior:"smooth",block:"start"})}
function renderVersionManager(a){const rows=(a.addon_releases||[]).slice().sort((x,y)=>new Date(y.created_at)-new Date(x.created_at)).map(r=>`<div class="release-admin"><div><div><b>v${esc(r.version)}</b> <span class="tag">MC ${esc(r.mc_version||"-")}</span> <span class="tag">${r.download_mode==="external_link"?"From link":"Download here"}</span></div><p class="muted">${esc(r.changelog||"Tidak ada changelog")}</p>${r.download_mode==="external_link"?`<code>${esc(r.download_url||"-")}</code>`:`<code>${esc(r.file_name||r.file_path||"-")}</code>`}</div><button class="btn small danger" onclick="deleteRelease('${r.id}')">Hapus file</button></div>`).join("");$("versionManager").innerHTML=rows||"<p class='muted'>Belum ada file versi.</p>"}

window.togglePinAddon=async(id,pinned)=>{if(!requireAdmin())return;const {error}=await sb.from("addons").update({is_pinned:!!pinned}).eq("id",id);if(error)return toast(error.message,true);await loadAdmin();await renderFeatured();toast(pinned?"Addon disematkan":"Sematan addon dilepas")};

async function loadAdmin(){if(!requireAdmin())return;const addons=await fetchAddons();const [{count:requestCount},{data:users},{count:reportCount},{count:donorCount}]=await Promise.all([sb.from("requests").select("id",{count:"exact",head:true}),sb.from("profiles").select("id,username,display_name,avatar_url,role,created_at").order("created_at",{ascending:true}).range(0,9999),sb.from("bug_reports").select("id",{count:"exact",head:true}),sb.from("donations").select("id",{count:"exact",head:true})]);$("stats").innerHTML=`<div class="stat"><b>${addons.length}</b><span>Addons</span></div><div class="stat"><b>${requestCount||0}</b><span>Requests</span></div><div class="stat"><b>${users?.length||0}</b><span>Users</span></div><div class="stat"><b>${(reportCount||0)+(donorCount||0)}</b><span>Reports + Donors</span></div>`;$("adminAddonList").innerHTML=sortAddons(addons).map(a=>{const r=latestRelease(a);return `<div class="admin-addon-card"><div class="admin-addon-main">${a.image_path?`<img src="${esc(asset(a.image_path))}" alt="">`:'<div class="admin-mini-placeholder">FW</div>'}<div><h3>${esc(a.name)}</h3><p class="muted">Latest v${esc(r?.version||"-")} · MC ${esc(r?.mc_version||"-")} · ${(a.addon_releases||[]).length} file · Last Update ${fmtDateOnly(a.updated_at||a.created_at)}</p></div></div><div class="actions"><button class="btn small ${a.is_pinned?"orange":"ghost"}" onclick="togglePinAddon('${a.id}',${a.is_pinned?'false':'true'})">${a.is_pinned?'Lepas Sematan':'Sematkan Addon'}</button><button class="btn small" onclick="openAdminAddon('${a.id}')">Kelola / Update</button><button class="btn small danger" onclick="deleteAddon('${a.id}')">Hapus</button></div></div>`}).join("")||"<p class='muted'>Belum ada addon.</p>";allUsersCache=users||[];renderAdminUsers(allUsersCache);await loadAdminDonate()}
function renderAdminUsers(users){const q=$("adminUserSearch").value.trim().toLowerCase();const list=(users||[]).filter(u=>(u.username+" "+u.display_name+" "+u.role).toLowerCase().includes(q));$("adminUserList").innerHTML=list.map(u=>`<div class="admin-item"><div class="user-line">${avatarHTML(u)}<div>${userNameHTML(u)}<div class="muted">${usernameHTML(u)} · ${esc(u.role)} · ${fmt(u.created_at)}</div></div></div>${u.id!==currentUser?.id?`<div class="actions"><button class="btn small ghost" onclick="toggleAdmin('${u.id}','${u.role==='admin'?'user':'admin'}')">${u.role==='admin'?'Jadikan User':'Jadikan Admin'}</button><button class="btn small danger" onclick="deleteUser('${u.id}','${esc(u.username).replace(/'/g,"\'")}')">Hapus User</button></div>`:''}</div>`).join("")||"<p class='muted'>Tidak ada user.</p>"}
$("adminUserSearch").oninput=()=>renderAdminUsers(allUsersCache);window.toggleAdmin=async(id,role)=>{if(!requireAdmin())return;let rpcResult;try{rpcResult=await sb.rpc("set_user_role",{p_user_id:id,p_role:role})}catch(e){return toast(e.message||"Gagal memperbarui role.",true)}const {error}=rpcResult;if(error)return toast(error.message,true);await loadAdmin();toast("Role diperbarui")};
window.deleteUser=async(id,username)=>{if(!requireAdmin()||id===currentUser?.id)return;if(!confirm(`Hapus user @${username}? Data milik user akan ikut dibersihkan.`))return;try{const {error}=await sb.rpc("admin_delete_user",{p_user_id:id});if(error)throw error;await loadAdmin();toast("User berhasil dihapus")}catch(e){toast(e.message||"Gagal menghapus user.",true)}};

async function fetchRequests(scope="public"){let q=sb.from("requests").select("*").order("created_at",{ascending:false}).range(0,9999);if(scope==="public")q=q.eq("visibility","public");if(scope==="mine")q=q.eq("user_id",currentUser.id);const {data,error}=await q;if(error){toast(error.message,true);return[]}const arr=data||[],pm=await getProfiles(arr.map(x=>x.user_id)),ids=arr.map(x=>x.id);let supports=[],comments=[];if(ids.length){const s=await sb.from("request_supports").select("request_id,user_id").in("request_id",ids).range(0,9999);supports=s.data||[];const c=await sb.from("request_comments").select("id,request_id,user_id,parent_id,body,created_at,updated_at").in("request_id",ids).order("created_at",{ascending:true}).range(0,9999);comments=c.data||[]}const cm=await getProfiles(comments.map(x=>x.user_id)),sm={};supports.forEach(x=>(sm[x.request_id]??=[]).push(x.user_id));const cmm={};comments.forEach(x=>(cmm[x.request_id]??=[]).push({...x,profiles:cm[x.user_id]||null}));return arr.map(x=>({...x,profiles:pm[x.user_id]||null,_supporters:sm[x.id]||[],_comments:cmm[x.id]||[]}))}
function commentThread(items,type,id){const roots=items.filter(x=>!x.parent_id),children=p=>items.filter(x=>x.parent_id===p);const draw=c=>{const kids=children(c.id),own=c.user_id===currentUser?.id;return `<div class="thread-item">${avatarHTML(c.profiles||{})}<div class="thread-body"><div class="comment-meta">${userNameHTML(c.profiles)}${usernameHTML(c.profiles)}<time>${fmt(c.created_at)}</time></div><p>${esc(c.body)}</p><div class="thread-tools">${currentUser?`<button class="text-btn" onclick="toggleRequestReply('${c.id}')">Reply</button>`:""}${kids.length?`<button class="text-btn" onclick="toggleRequestReplies('${c.id}')">Balasan (${kids.length})</button>`:""}${own?`<button class="text-btn" onclick="editRequestComment('${c.id}')">Edit</button><button class="text-btn danger-text" onclick="deleteRequestComment('${c.id}')">Hapus</button>`:""}</div>${currentUser?`<div id="requestreply_${c.id}" class="reply-box hidden"><textarea class="input" id="requestreplytext_${c.id}" rows="2" placeholder="Balas..."></textarea><button class="btn small" onclick="replyRequest('${id}','${c.id}')">Balas</button></div>`:""}<div id="requestreplies_${c.id}" class="replies hidden">${kids.map(draw).join("")}</div></div></div>`};return roots.map(draw).join("")||'<p class="muted">Belum ada komentar.</p>'}
function requestCard(r,admin=false){const own=r.user_id===currentUser?.id,support=r._supporters?.includes(currentUser?.id),count=r._supporters?.length||0;return `<article class="request-card"><div class="request-head"><div class="request-author">${avatarHTML(r.profiles||{})}<div><h3>${esc(r.title)}</h3><p class="muted">@${esc(r.profiles?.username||"user")} · ${fmt(r.created_at)} · ${esc(r.visibility)}</p></div></div><span class="tag status-${esc(r.status)}">${esc(r.status)}</span></div><p>${esc(r.description)}</p>${r.file_path?`<button class="text-btn" onclick="downloadRequestFile('${r.id}')">Download file referensi${r.file_name?`: ${esc(r.file_name)}`:""}</button>`:""}<div class="request-actions">${!own&&r.visibility==='public'?`<button class="btn small ${support?'':'ghost'}" onclick="toggleSupport('${r.id}')">☑ ${support?'Kamu setuju':'Centang untuk setujui'}</button>`:""}<b>${count} User setuju dengan request ini</b>${own&&!admin?`<button class="btn small ghost" onclick="editRequest('${r.id}')">Edit</button><button class="btn small danger" onclick="deleteOwnRequest('${r.id}')">Hapus</button>`:""}</div><div class="request-comments"><h4>${r._comments?.length||0} komentar</h4>${commentThread(r._comments||[],"request",r.id)}</div>${currentUser&&r.visibility==='public'?`<div class="comment-compose compact"><input class="input" id="requestComment_${r.id}" placeholder="Komentar request ini"><button class="btn small" onclick="postRequestComment('${r.id}')">Kirim</button></div>`:""}${admin?`<div class="request-admin-actions"><button class="btn small" onclick="setRequestStatus('${r.id}','accepted')">Setujui</button><button class="btn small ghost" onclick="setRequestStatus('${r.id}','rejected')">Tolak</button><button class="btn small danger" onclick="deleteRequest('${r.id}')">Hapus</button></div>`:""}</article>`}
async function loadRequestsPage(){const u=!!currentUser;$("requestGate").innerHTML=u?'':'<div class="panel"><h3>Login diperlukan</h3><p class="muted">Login untuk membuat, mendukung, dan membalas request.</p><button class="btn" id="requestLogin">Login / Register</button></div>';const lg=$("requestLogin");if(lg)lg.onclick=()=>openAuth();$("manageMyRequestsBtn").classList.toggle("hidden",!u);if(u){myRequestsCache=await fetchRequests("mine");renderMyRequests(myRequestsCache)}else $("myRequestsPanel").classList.add("hidden");publicRequestsCache=await fetchRequests("public");renderPublicRequests(publicRequestsCache)}
function renderPublicRequests(arr){const q=$("requestSearch").value.toLowerCase();$("publicRequests").innerHTML=arr.filter(r=>(r.title+" "+r.description+" "+(r.profiles?.username||"")).toLowerCase().includes(q)).map(r=>requestCard(r)).join("")||"<p class='muted'>Belum ada request public.</p>"}function renderMyRequests(arr){$("myRequestsList").innerHTML=arr.map(r=>requestCard(r,false)).join("")||"<p class='muted'>Kamu belum membuat request.</p>"}
$("manageMyRequestsBtn").onclick=()=>$("myRequestsPanel").classList.toggle("hidden");$("addRequestBtn").onclick=()=>openRequestEditor();$("cancelRequestEdit").onclick=resetRequestForm;$("closeRequestForm").onclick=resetRequestForm;$("requestSearch").oninput=()=>renderPublicRequests(publicRequestsCache);
function openRequestEditor(r){if(!requireAuth())return;$("requestForm").classList.remove("hidden");$("requestFormTitle").textContent=r?"Edit Request":"Add Request";$("editRequestId").value=r?.id||"";$("reqTitle").value=r?.title||"";$("reqText").value=r?.description||"";$("reqVisibility").value=r?.visibility||"private";$("reqFile").value="";$("reqFileName").textContent=r?.file_name||"Belum ada file";$("requestForm").scrollIntoView({behavior:"smooth",block:"start"})}
function resetRequestForm(){$("requestForm").classList.add("hidden");$("requestForm").reset();$("editRequestId").value="";$("reqFileName").textContent="Belum ada file";$('requestFormTitle').textContent="Add Request"}
window.editRequest=id=>{const r=myRequestsCache.find(x=>x.id===id);if(r)openRequestEditor(r)};
$("requestForm").onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;try{const id=$("editRequestId").value,title=$("reqTitle").value.trim(),description=$("reqText").value.trim(),visibility=$("reqVisibility").value,file=$("reqFile").files[0];if(!title||!description)return;if(id){const {data:old,error:o}=await sb.from("requests").select("user_id,file_path,file_name").eq("id",id).single();if(o||old?.user_id!==currentUser.id)throw new Error("Request tidak ditemukan.");let fp=old.file_path,fn=old.file_name;if(file){if(file.size>8*1024*1024)throw new Error("File maksimal 8 MB.");fp=`${currentUser.id}/${id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await sb.storage.from("request-files").upload(fp,file,{upsert:false});if(up.error)throw up.error;fn=file.name}const {error}=await sb.from("requests").update({title,description,visibility,file_path:fp,file_name:fn,updated_at:iso()}).eq("id",id).eq("user_id",currentUser.id);if(error)throw error;toast("Request diperbarui")}else{const {data:created,error}=await sb.from("requests").insert({user_id:currentUser.id,title,description,visibility}).select().single();if(error)throw error;if(file){if(file.size>8*1024*1024)throw new Error("File maksimal 8 MB.");const fp=`${currentUser.id}/${created.id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await sb.storage.from("request-files").upload(fp,file,{upsert:false});if(up.error)throw up.error;await sb.from("requests").update({file_path:fp,file_name:file.name}).eq("id",created.id)}}resetRequestForm();await loadRequestsPage()}catch(e){toast(e.message||"Gagal menyimpan request.",true)}};
window.deleteOwnRequest=async id=>{if(!requireAuth()||!confirm("Hapus request ini?"))return;const {error}=await sb.from("requests").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return toast(error.message,true);await loadRequestsPage();toast("Request dihapus")};window.toggleSupport=async id=>{if(!requireAuth())return;const r=[...publicRequestsCache,...myRequestsCache].find(x=>x.id===id);if(!r||r.user_id===currentUser.id)return;const exists=r._supporters?.includes(currentUser.id);const result=exists?await sb.from("request_supports").delete().eq("request_id",id).eq("user_id",currentUser.id):await sb.from("request_supports").insert({request_id:id,user_id:currentUser.id});if(result.error)return toast(result.error.message,true);await loadRequestsPage()};
window.postRequestComment=async id=>{if(!requireAuth())return;const body=$(`requestComment_${id}`)?.value.trim();if(!body)return;const {error}=await sb.from("request_comments").insert({request_id:id,user_id:currentUser.id,body,parent_id:null});if(error)return toast(`Gagal komentar: ${error.message}`,true);await loadRequestsPage();toast("Komentar dikirim")};window.replyRequest=async(id,parent)=>{if(!requireAuth())return;const input=$(`requestreplytext_${parent}`),body=input?.value.trim();if(!body)return toast("Isi balasan dulu.",true);try{const check=await sb.from("requests").select("id,visibility,user_id").eq("id",id).single();if(check.error)throw check.error;if(check.data.visibility!=="public"&&check.data.user_id!==currentUser.id&&currentProfile?.role!=="admin")throw new Error("Request ini tidak dapat dibalas.");const {error}=await sb.from("request_comments").insert({request_id:id,user_id:currentUser.id,parent_id:parent,body});if(error)throw error;if(input)input.value="";await loadRequestsPage();toast("Balasan dikirim")}catch(e){toast(`Gagal membalas: ${e.message||e}`,true)}};window.toggleRequestReply=id=>{const el=$(`requestreply_${id}`);if(el){el.classList.toggle("hidden");if(!el.classList.contains("hidden"))$(`requestreplytext_${id}`)?.focus()}};window.toggleRequestReplies=id=>$(`requestreplies_${id}`)?.classList.toggle("hidden");
window.editRequestComment=async id=>{if(!requireAuth())return;const {data:c}=await sb.from("request_comments").select("body,request_id,user_id").eq("id",id).single();if(!c||c.user_id!==currentUser.id)return toast("Komentar tidak ditemukan.",true);const body=prompt("Edit komentar",c.body);if(body===null)return;const v=body.trim();if(!v)return;const {error}=await sb.from("request_comments").update({body:v,updated_at:iso()}).eq("id",id).eq("user_id",currentUser.id);if(error)return toast(error.message,true);await loadRequestsPage()};window.deleteRequestComment=async id=>{if(!requireAuth()||!confirm("Hapus komentar ini?"))return;const {data:c}=await sb.from("request_comments").select("request_id,user_id").eq("id",id).single();if(!c||c.user_id!==currentUser.id)return toast("Komentar tidak ditemukan.",true);const {error}=await sb.from("request_comments").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return toast(error.message,true);await loadRequestsPage()};
window.downloadRequestFile=async id=>{if(!requireAuth())return;const r=[...publicRequestsCache,...myRequestsCache].find(x=>x.id===id);if(!r?.file_path)return;const {data,error}=await sb.storage.from("request-files").createSignedUrl(r.file_path,300);if(error)return toast(error.message,true);window.open(data.signedUrl,"_blank")};

async function loadAdminRequests(){if(!requireAdmin())return;let {data,error}=await sb.from("requests").select("*").order("created_at",{ascending:false}).range(0,9999);if(error)return toast(error.message,true);const pm=await getProfiles((data||[]).map(x=>x.user_id));data=(data||[]).map(x=>({...x,profiles:pm[x.user_id]||null}));const q=$("adminRequestSearch").value.toLowerCase(),st=$("adminRequestStatus").value;data=data.filter(r=>(!q||(r.title+" "+r.description+" "+(r.profiles?.username||"")).toLowerCase().includes(q))&&(!st||r.status===st));const ids=data.map(x=>x.id),supports=ids.length?(await sb.from("request_supports").select("request_id,user_id").in("request_id",ids).range(0,9999)).data||[]:[],comments=ids.length?(await sb.from("request_comments").select("id,request_id,user_id,parent_id,body,created_at,updated_at").in("request_id",ids).range(0,9999)).data||[]:[];const cm=await getProfiles(comments.map(x=>x.user_id)),sm={};supports.forEach(x=>(sm[x.request_id]??=[]).push(x.user_id));const cc={};comments.forEach(x=>(cc[x.request_id]??=[]).push({...x,profiles:cm[x.user_id]||null}));data=data.map(x=>({...x,_supporters:sm[x.id]||[],_comments:cc[x.id]||[]}));$("adminRequestList").innerHTML=data.map(x=>requestCard(x,true)).join("")||"<p class='muted'>Tidak ada request.</p>"}
$("adminRequestSearch").oninput=loadAdminRequests;$("adminRequestStatus").onchange=loadAdminRequests;window.setRequestStatus=async(id,status)=>{if(!requireAdmin())return;const {error}=await sb.from("requests").update({status,updated_at:iso()}).eq("id",id);if(error)return toast(error.message,true);await loadAdminRequests();toast("Status request diperbarui")};window.deleteRequest=async id=>{if(!requireAdmin()||!confirm("Hapus request ini?"))return;const {error}=await sb.from("requests").delete().eq("id",id);if(error)return toast(error.message,true);await loadAdminRequests();toast("Request dihapus")};

async function saveAvatarFromCrop(blob){const path=`${currentUser.id}/profile.png`;const up=await sb.storage.from("avatars").upload(path,blob,{upsert:true,contentType:"image/png"});if(up.error)throw up.error;return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl+`?v=${Date.now()}`}
async function renderProfile(){if(!currentProfile)return;$("profileUsername").value=currentProfile.username;$("profileUsernameLabel").textContent=`@${currentProfile.username}`;$("profileHeading").textContent=currentProfile.display_name||currentProfile.username;$("profileName").value=currentProfile.display_name||"";$("profileAvatarPreview").outerHTML=avatarHTML(currentProfile,"big").replace('<div class="avatar big">','<div id="profileAvatarPreview" class="avatar big">')}
$("profileAvatarFile").addEventListener("change",e=>{const f=e.target.files?.[0];if(f)openCrop(f)});
$("profileForm").onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;try{const display_name=$("profileName").value.trim()||currentProfile.username;let avatar_url=currentProfile.avatar_url||null;if(cropState.blob){avatar_url=await saveAvatarFromCrop(cropState.blob);cropState.blob=null}const {data,error}=await sb.from("profiles").update({display_name,avatar_url,updated_at:iso()}).eq("id",currentUser.id).select().single();if(error)throw error;currentProfile=data;renderProfile();$("profileAvatarFile").value="";$("profileAvatarName").textContent="Belum ada gambar";toast("Profile disimpan")}catch(e){toast(e.message||"Gagal menyimpan profile.",true)}};
$("removeAvatarBtn").onclick=async()=>{if(!requireAuth())return;await sb.storage.from("avatars").remove([`${currentUser.id}/profile.png`]);const {data,error}=await sb.from("profiles").update({avatar_url:null,updated_at:iso()}).eq("id",currentUser.id).select().single();if(error)return toast(error.message,true);currentProfile=data;await renderProfile();toast("Foto profil dihapus")};
$("passwordForm").onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;const oldP=$("oldPassword").value,newP=$("newPassword").value;const check=await sb.auth.signInWithPassword({email:usernameEmail(currentProfile.username),password:oldP});if(check.error)return toast("Password lama salah.",true);const {error}=await sb.auth.updateUser({password:newP});if(error)return toast(error.message,true);e.target.reset();toast("Password berhasil diubah")};

function openCrop(file){if(!file.type.startsWith("image/"))return toast("File harus berupa gambar.",true);const fr=new FileReader();fr.onload=()=>{cropImage=new Image();cropImage.onload=()=>{cropState={x:0,y:0,zoom:Math.max(1,Math.min(3,320/Math.min(cropImage.width,cropImage.height))),drag:false,sx:0,sy:0,ox:0,oy:0};$("cropZoom").value=cropState.zoom;$("cropModal").classList.remove("hidden");drawCrop()};cropImage.src=fr.result};fr.readAsDataURL(file)}
function drawCrop(){const c=$("cropCanvas"),ctx=c.getContext("2d");ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle="#05080d";ctx.fillRect(0,0,c.width,c.height);if(!cropImage)return;const scale=cropState.zoom*Math.max(c.width/cropImage.width,c.height/cropImage.height);const w=cropImage.width*scale,h=cropImage.height*scale;const x=(c.width-w)/2+cropState.x,y=(c.height-h)/2+cropState.y;ctx.drawImage(cropImage,x,y,w,h);ctx.save();ctx.strokeStyle="#7db9ff";ctx.lineWidth=2;ctx.strokeRect(1,1,c.width-2,c.height-2);ctx.restore()}
$("cropZoom").oninput=e=>{cropState.zoom=Number(e.target.value);drawCrop()};$("cropCanvas").addEventListener("pointerdown",e=>{cropState.drag=true;cropState.sx=e.clientX;cropState.sy=e.clientY;cropState.ox=cropState.x;cropState.oy=cropState.y;$("cropCanvas").setPointerCapture(e.pointerId)});$("cropCanvas").addEventListener("pointermove",e=>{if(!cropState.drag)return;cropState.x=cropState.ox+e.clientX-cropState.sx;cropState.y=cropState.oy+e.clientY-cropState.sy;drawCrop()});["pointerup","pointercancel"].forEach(ev=>$("cropCanvas").addEventListener(ev,()=>cropState.drag=false));
async function makeCropBlob(){const c=document.createElement("canvas");c.width=512;c.height=512;const ctx=c.getContext("2d"),source=$("cropCanvas"),scale=512/source.width;ctx.drawImage(source,0,0,512,512);return new Promise(r=>c.toBlob(r,"image/png",.92))}
$("applyCrop").onclick=async()=>{if(!cropImage)return;cropImage=null;cropState.blob=await makeCropBlobFromCanvas();$("cropModal").classList.add("hidden");toast("Crop siap. Klik Save Profile untuk menyimpan")};
async function makeCropBlobFromCanvas(){const out=document.createElement("canvas");out.width=512;out.height=512;const ctx=out.getContext("2d");ctx.fillStyle="#05080d";ctx.fillRect(0,0,512,512);if(cropImage){const scale=cropState.zoom*Math.max(512/cropImage.width,512/cropImage.height);const w=cropImage.width*scale,h=cropImage.height*scale;const x=(512-w)/2+cropState.x*(512/320),y=(512-h)/2+cropState.y*(512/320);ctx.drawImage(cropImage,x,y,w,h)}return new Promise(r=>out.toBlob(r,"image/png",.92))}
$("closeCrop").onclick=$("cancelCrop").onclick=()=>{$("cropModal").classList.add("hidden");cropImage=null;cropState.blob=null};

async function loadBugPage(){const u=!!currentUser;$("bugGate").innerHTML=u?'':'<div class="panel"><h3>Login diperlukan</h3><p class="muted">Login untuk mengirim dan mengelola report bug.</p><button class="btn" id="bugLogin">Login / Register</button></div>';const b=$("bugLogin");if(b)b.onclick=()=>openAuth();$("newBugBtn").classList.toggle("hidden",!u);if(!u){$("bugForm").classList.add("hidden");$("myBugList").innerHTML='<p class="muted">Login untuk melihat report milikmu.</p>';return}const {data,error}=await sb.from("bug_reports").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false}).range(0,9999);if(error)return toast(error.message,true);myBugsCache=data||[];renderMyBugs()}
function renderMyBugs(){const arr=myBugsCache;$("myBugList").innerHTML=arr.map(r=>`<article class="request-card"><div class="request-head"><div><h3>${esc(r.title)}</h3><p class="muted">${esc(r.category)} · ${fmt(r.created_at)}</p></div><span class="tag status-${esc(r.status)}">${esc(r.status)}</span></div><p>${esc(r.description)}</p>${r.screenshot_path?'<span class="muted">Screenshot terlampir</span>':''}<div class="actions"><button class="btn small ghost" onclick="editBug('${r.id}')">Edit</button><button class="btn small danger" onclick="deleteBug('${r.id}')">Hapus</button></div></article>`).join("")||"<p class='muted'>Belum ada report.</p>"}
function resetBugForm(){$("bugForm").classList.add("hidden");$("bugForm").reset();$("editBugId").value="";$("bugFormTitle").textContent="Report Bug";$("bugFileName").textContent="Belum ada gambar"}
function openBugEditor(r){$("bugForm").classList.remove("hidden");$("bugFormTitle").textContent=r?"Edit Report Bug":"Report Bug";$("editBugId").value=r?.id||"";$("bugTitle").value=r?.title||"";$("bugCategory").value=r?.category||"Website";$("bugDescription").value=r?.description||"";$("bugForm").scrollIntoView({behavior:"smooth",block:"start"})}
$("newBugBtn").onclick=()=>openBugEditor();$("closeBugForm").onclick=resetBugForm;$("cancelBugEdit").onclick=resetBugForm;
window.editBug=id=>{const r=myBugsCache.find(x=>x.id===id);if(r)openBugEditor(r)};window.deleteBug=async id=>{if(!requireAuth()||!confirm("Hapus report ini?"))return;const {error}=await sb.from("bug_reports").delete().eq("id",id).eq("user_id",currentUser.id);if(error)return toast(error.message,true);await loadBugPage();toast("Report dihapus")};
$("bugForm").onsubmit=async e=>{e.preventDefault();if(!requireAuth())return;try{const id=$("editBugId").value,title=$("bugTitle").value.trim(),category=$("bugCategory").value,description=$("bugDescription").value.trim(),file=$("bugFile").files[0];if(!title||!description)return;let path=null,name=null;if(id){const old=await sb.from("bug_reports").select("user_id,screenshot_path,screenshot_name,status").eq("id",id).single();if(old.error||old.data.user_id!==currentUser.id)throw new Error("Report tidak ditemukan.");path=old.data.screenshot_path;name=old.data.screenshot_name;if(file){if(file.size>6*1024*1024)throw new Error("Screenshot maksimal 6 MB.");path=`${currentUser.id}/${id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await sb.storage.from("bug-reports").upload(path,file,{upsert:false});if(up.error)throw up.error;name=file.name}const {error}=await sb.from("bug_reports").update({title,category,description,screenshot_path:path,screenshot_name:name,updated_at:iso()}).eq("id",id).eq("user_id",currentUser.id);if(error)throw error}else{const {data:r,error}=await sb.from("bug_reports").insert({user_id:currentUser.id,title,category,description}).select().single();if(error)throw error;if(file){if(file.size>6*1024*1024)throw new Error("Screenshot maksimal 6 MB.");path=`${currentUser.id}/${r.id}/${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await sb.storage.from("bug-reports").upload(path,file,{upsert:false});if(up.error)throw up.error;await sb.from("bug_reports").update({screenshot_path:path,screenshot_name:file.name}).eq("id",r.id)}}resetBugForm();await loadBugPage();toast("Report terkirim")}catch(e){toast(e.message||"Gagal mengirim report.",true)}};

async function loadDonate(){if(!sb)return;const {data}=await sb.from("site_settings").select("donation_url").eq("id",1).maybeSingle();const url=data?.donation_url||"";$("donateLink").classList.toggle("hidden",!url);$("donateEmpty").style.display=url?"none":"block";if(url)$("donateLink").href=url}
async function loadAdminDonate(){if(!requireAdmin())return;const s=await sb.from("site_settings").select("donation_url").eq("id",1).maybeSingle();$("donateUrlAdmin").value=s.data?.donation_url||"";const d=await sb.from("donations").select("*").order("created_at",{ascending:false}).range(0,9999);renderDonors(d.data||[])}
function renderDonors(arr){$("donorList").innerHTML=arr.map(d=>`<div class="admin-item"><div><b>${esc(d.donor_name)}</b><div class="muted">${d.amount?`Rp ${Number(d.amount).toLocaleString("id-ID")}`:"Jumlah tidak dicatat"} · ${esc(d.source||"Saweria")} · ${fmt(d.created_at)}</div>${d.note?`<div class="muted">${esc(d.note)}</div>`:""}</div><button class="btn small danger" onclick="deleteDonor('${d.id}')">Hapus</button></div>`).join("")||"<p class='muted'>Belum ada donatur yang dicatat.</p>"}
$("saveDonateUrl").onclick=async()=>{if(!requireAdmin())return;const url=$("donateUrlAdmin").value.trim();if(url&&!/^https?:\/\//i.test(url))return toast("URL harus dimulai http:// atau https://",true);const {error}=await sb.from("site_settings").upsert({id:1,donation_url:url,updated_at:iso()},{onConflict:"id"});if(error)return toast(error.message,true);await loadDonate();toast("Link donate disimpan")};
$("addDonorBtn").onclick=()=>$("donorForm").classList.remove("hidden");$("cancelDonorBtn").onclick=()=>{$("donorForm").classList.add("hidden")};$("saveDonorBtn").onclick=async()=>{if(!requireAdmin())return;const name=$("donorName").value.trim(),amount=Number($("donorAmount").value||0),source=$("donorSource").value.trim()||"Saweria",note=$("donorNote").value.trim();if(!name)return toast("Nama donor wajib diisi.",true);const {error}=await sb.from("donations").insert({donor_name:name,amount:amount||null,source,note,created_by:currentUser.id});if(error)return toast(error.message,true);["donorName","donorAmount","donorSource","donorNote"].forEach(id=>$(id).value=id==="donorSource"?"Saweria":"");$("donorForm").classList.add("hidden");await loadAdminDonate();toast("Donatur ditambahkan")};window.deleteDonor=async id=>{if(!requireAdmin()||!confirm("Hapus data donatur?"))return;const {error}=await sb.from("donations").delete().eq("id",id);if(error)return toast(error.message,true);await loadAdminDonate()};

let announcementCache=[];
function announcementCard(a,admin=false){return `<article class="announcement-card"><div class="announcement-head"><div><h2>${esc(a.title)}</h2><p class="muted">${fmt(a.created_at)}${a.updated_at&&a.updated_at!==a.created_at?` · Diubah ${fmt(a.updated_at)}`:""}</p></div>${admin?`<span class="tag ${a.is_published?"status-accepted":"status-pending"}">${a.is_published?"Published":"Draft"}</span>`:""}</div><div class="announcement-body">${esc(a.body).replace(/\n/g,"<br>")}</div>${admin?`<div class="actions"><button class="btn small" onclick="editAnnouncement('${a.id}')">Edit</button><button class="btn small ghost" onclick="toggleAnnouncementPublish('${a.id}',${a.is_published?'false':'true'})">${a.is_published?'Sembunyikan':'Publish'}</button><button class="btn small danger" onclick="deleteAnnouncement('${a.id}')">Hapus</button></div>`:""}</article>`}
async function fetchAnnouncements(admin=false){if(!sb)return[];let q=sb.from("announcements").select("*").order("created_at",{ascending:false}).range(0,9999);if(!admin)q=q.eq("is_published",true);const {data,error}=await q;if(error){toast(error.message,true);return[]}return data||[]}
async function loadAnnouncements(){const list=await fetchAnnouncements(false);announcementCache=list;$("announcementList").innerHTML=list.map(a=>announcementCard(a)).join("")||'<div class="panel"><p class="muted">Belum ada pengumuman.</p></div>';const admin=currentProfile?.role==="admin";$("newAnnouncementBtn").classList.toggle("hidden",!admin);$("announcementAdminBox").classList.add("hidden")}
function openAnnouncementForm(a=null){if(!requireAdmin())return;$("announcementAdminBox").classList.remove("hidden");$("editAnnouncementId").value=a?.id||"";$("announcementTitle").value=a?.title||"";$("announcementBody").value=a?.body||"";$("announcementPublished").checked=a?!!a.is_published:true;$("announcementFormTitle").textContent=a?"Edit Pengumuman":"Buat Pengumuman";$("saveAnnouncementBtn").textContent=a?"Simpan Perubahan":"Publish Announcement";$("announcementAdminBox").scrollIntoView({behavior:"smooth",block:"start"})}
async function loadAdminAnnouncements(){if(!requireAdmin())return;const list=await fetchAnnouncements(true);announcementCache=list;$("adminAnnouncementList").innerHTML=list.map(a=>announcementCard(a,true)).join("")||'<p class="muted">Belum ada pengumuman.</p>'}
window.editAnnouncement=id=>{const a=announcementCache.find(x=>x.id===id);if(a)showPage("announcements"),openAnnouncementForm(a)};
window.toggleAnnouncementPublish=async(id,published)=>{if(!requireAdmin())return;const {error}=await sb.from("announcements").update({is_published:!!published,updated_at:iso()}).eq("id",id);if(error)return toast(error.message,true);await loadAnnouncements();await loadAdminAnnouncements();toast(published?"Pengumuman dipublikasikan":"Pengumuman disembunyikan")};
window.deleteAnnouncement=async id=>{if(!requireAdmin()||!confirm("Hapus pengumuman ini?"))return;const {error}=await sb.from("announcements").delete().eq("id",id);if(error)return toast(error.message,true);await loadAnnouncements();await loadAdminAnnouncements();toast("Pengumuman dihapus")};
$("newAnnouncementBtn").onclick=()=>openAnnouncementForm();$("adminNewAnnouncementBtn").onclick=()=>{showPage("announcements");openAnnouncementForm()};$("closeAnnouncementForm").onclick=()=>$("announcementAdminBox").classList.add("hidden");$("cancelAnnouncementBtn").onclick=()=>$("announcementAdminBox").classList.add("hidden");
$("saveAnnouncementBtn").onclick=async()=>{if(!requireAdmin())return;const id=$("editAnnouncementId").value,title=$("announcementTitle").value.trim(),body=$("announcementBody").value.trim(),is_published=$("announcementPublished").checked;if(!title||!body)return toast("Judul dan isi pengumuman wajib diisi.",true);try{let error;if(id){({error}=await sb.from("announcements").update({title,body,is_published,updated_at:iso()}).eq("id",id))}else{({error}=await sb.from("announcements").insert({title,body,is_published,created_by:currentUser.id}))}if(error)throw error;$("announcementAdminBox").classList.add("hidden");await loadAnnouncements();await loadAdminAnnouncements();toast(id?"Pengumuman diperbarui":"Pengumuman diterbitkan")}catch(e){toast(e.message||"Gagal menyimpan pengumuman.",true)}};

async function loadAdminReports(){if(!requireAdmin())return;const {data,error}=await sb.from("bug_reports").select("*").order("created_at",{ascending:false}).range(0,9999);if(error)return toast(error.message,true);const pm=await getProfiles((data||[]).map(x=>x.user_id));let arr=(data||[]).map(x=>({...x,profiles:pm[x.user_id]||null}));const q=$("adminReportSearch").value.toLowerCase(),st=$("adminReportStatus").value;arr=arr.filter(r=>(!q||(r.title+" "+r.description+" "+(r.profiles?.username||"")).toLowerCase().includes(q))&&(!st||r.status===st));$("adminReportList").innerHTML=arr.map(r=>`<article class="request-card"><div class="request-head"><div class="request-author">${avatarHTML(r.profiles||{})}<div><h3>${esc(r.title)}</h3><p class="muted">${usernameHTML(r.profiles)} · ${esc(r.category)} · ${fmt(r.created_at)}</p></div></div><span class="tag status-${esc(r.status)}">${esc(r.status)}</span></div><p>${esc(r.description)}</p>${r.screenshot_path?`<button class="text-btn" onclick="openBugScreenshot('${r.id}')">Lihat screenshot${r.screenshot_name?` · ${esc(r.screenshot_name)}`:""}</button>`:""}<div class="request-admin-actions"><button class="btn small" onclick="setBugStatus('${r.id}','in_progress')">In progress</button><button class="btn small" onclick="setBugStatus('${r.id}','resolved')">Selesai</button><button class="btn small ghost" onclick="setBugStatus('${r.id}','rejected')">Tolak</button><button class="btn small danger" onclick="adminDeleteBug('${r.id}')">Hapus</button></div></article>`).join("")||"<p class='muted'>Tidak ada report.</p>"}
$("adminReportSearch").oninput=loadAdminReports;$("adminReportStatus").onchange=loadAdminReports;window.setBugStatus=async(id,status)=>{if(!requireAdmin())return;const {error}=await sb.from("bug_reports").update({status,updated_at:iso()}).eq("id",id);if(error)return toast(error.message,true);await loadAdminReports();toast("Status report diperbarui")};window.adminDeleteBug=async id=>{if(!requireAdmin()||!confirm("Hapus report?"))return;const {error}=await sb.from("bug_reports").delete().eq("id",id);if(error)return toast(error.message,true);await loadAdminReports()};window.openBugScreenshot=async id=>{if(!requireAdmin())return;const {data}=await sb.from("bug_reports").select("screenshot_path").eq("id",id).single();if(!data?.screenshot_path)return;const r=await sb.storage.from("bug-reports").createSignedUrl(data.screenshot_path,300);if(r.error)return toast(r.error.message,true);window.open(r.data.signedUrl,"_blank")};

document.querySelectorAll(".admin-tabs .tab").forEach(b=>b.onclick=async()=>{document.querySelectorAll(".admin-tabs .tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".admin-tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.tab).classList.add("active");if(b.dataset.tab==="manageAddons")await loadAdmin();if(b.dataset.tab==="manageRequests")await loadAdminRequests();if(b.dataset.tab==="manageReports")await loadAdminReports();if(b.dataset.tab==="manageDonate")await loadAdminDonate();if(b.dataset.tab==="manageUsers")await loadAdmin();if(b.dataset.tab==="manageAnnouncements")await loadAdminAnnouncements();if(b.dataset.tab==="manageOthers")await loadAdminOthers()});

// Crop/profile state helper: keep selected blob separate from the Image object.
const originalApplyCrop=$("applyCrop").onclick;$("applyCrop").onclick=async()=>{if(!cropImage)return;const blob=await makeCropBlobFromCanvas();cropImage=null;cropState.blob=blob;$("cropModal").classList.add("hidden");toast("Crop siap. Klik Save Profile untuk menyimpan")};

$("addCategoryBtn").onclick=async()=>{if(!requireAdmin())return;const input=$("newCategoryName"),name=input.value.trim();if(!name)return toast("Nama kategori wajib diisi.",true);if(CATEGORIES.some(x=>x.toLowerCase()===name.toLowerCase()))return toast("Kategori sudah ada.",true);CATEGORIES.push(name);if(await saveSiteCategories()){input.value="";renderCategoryChoices([]);renderCategoryAdmin();toast("Kategori ditambahkan")}};$("restoreCategoriesBtn").onclick=async()=>{if(!requireAdmin()||!confirm("Hapus semua kategori custom dan pulihkan default?"))return;CATEGORIES=[...DEFAULT_CATEGORIES];if(await saveSiteCategories()){renderCategoryChoices([]);renderCategoryAdmin();toast("Kategori default dipulihkan")}};$("refreshCategoriesBtn").onclick=async()=>{await loadSiteCategories();renderCategoryChoices([]);renderCategoryAdmin();toast("Categories diperbarui")};$("refreshSiteDataBtn").onclick=async()=>{await loadAddons();await loadAdmin();toast("Data website diperbarui")};loadSiteCategories().then(()=>renderCategoryChoices([]));showSetup();updateNav();
const sharedAddonId=new URLSearchParams(window.location.search).get("addon");
if(sharedAddonId&&sb){setTimeout(()=>openAddon(sharedAddonId),350);}



/* =========================
   Fuyuko Web Addons v12
   Management / Help / Theme
   ========================= */
(()=>{
  if(!window.sb && typeof sb==="undefined") return;
  const root=document.documentElement;
  const siteDefaults={
    site_title:"Fuyuko Web Addons",
    hero_eyebrow:"MINECRAFT BEDROCK COMMUNITY",
    hero_title:"Discover. Download.",
    hero_highlight:"Build your world.",
    hero_description:"Fuyuko Web Addons adalah tempat untuk menemukan, berbagi, dan meminta addon Minecraft Bedrock.",
    latest_title:"Addon Terbaru",
    footer_text:"© 2026 Fuyuko Web Addons · Minecraft Bedrock Community"
  };
  let siteSettings={...siteDefaults};
  let galleryCache=[], tutorialCache=[], fileCache=[], activityCache=[];

  const publicUrl=(bucket,path)=>sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  const storagePathFromUrl=(bucket,url)=>{
    if(!url||!validHttpUrl(url)) return String(url||"");
    try{
      const u=new URL(url), marker=`/storage/v1/object/public/${bucket}/`;
      const idx=u.pathname.indexOf(marker);
      return idx>=0?decodeURIComponent(u.pathname.slice(idx+marker.length)):"";
    }catch{return ""}
  };
  const cleanName=s=>String(s||"").replace(/[^\w.\- ]+/g,"_").trim()||"file";
  const youtubeId=url=>{
    try{
      const u=new URL(url);
      if(u.hostname.includes("youtu.be")) return u.pathname.slice(1);
      if(u.searchParams.get("v")) return u.searchParams.get("v");
      const m=u.pathname.match(/\/embed\/([^/]+)/); return m?m[1]:"";
    }catch{return ""}
  };
  async function logActivity(action,details=""){
    if(!currentUser||currentProfile?.role!=="admin")return;
    try{await sb.from("activity_logs").insert({user_id:currentUser.id,action,details})}catch{}
  }
  async function loadSiteSettings(){
    const {data,error}=await sb.from("site_settings").select("*").eq("id",1).maybeSingle();
    if(!error&&data) siteSettings={...siteDefaults,...data};
    applySiteSettings();
  }
  function applySiteSettings(){
    document.title=siteSettings.site_title||siteDefaults.site_title;
    const ey=document.querySelector(".hero .eyebrow"); if(ey)ey.textContent=siteSettings.hero_eyebrow||siteDefaults.hero_eyebrow;
    const h=document.querySelector(".hero h1"); if(h)h.innerHTML=`${esc(siteSettings.hero_title||siteDefaults.hero_title)}<br><span>${esc(siteSettings.hero_highlight||siteDefaults.hero_highlight)}</span>`;
    const p=document.querySelector(".hero>div:first-child p"); if(p)p.textContent=siteSettings.hero_description||siteDefaults.hero_description;
    const latest=document.querySelector("#home .section-head h2"); if(latest)latest.textContent=siteSettings.latest_title||siteDefaults.latest_title;
    const ft=document.querySelector("footer p"); if(ft)ft.textContent=siteSettings.footer_text||siteDefaults.footer_text;
  }
  async function saveSiteSettings(){
    if(!requireAdmin())return;
    const payload={
      id:1,
      site_title:$("siteSiteTitle").value.trim()||siteDefaults.site_title,
      hero_eyebrow:$("siteHeroEyebrow").value.trim()||siteDefaults.hero_eyebrow,
      hero_title:$("siteHeroTitle").value.trim()||siteDefaults.hero_title,
      hero_highlight:$("siteHeroHighlight").value.trim()||siteDefaults.hero_highlight,
      hero_description:$("siteHeroDescription").value.trim()||siteDefaults.hero_description,
      latest_title:$("siteLatestTitle").value.trim()||siteDefaults.latest_title,
      footer_text:$("siteFooterText").value.trim()||siteDefaults.footer_text,
      updated_at:iso()
    };
    const {error}=await sb.from("site_settings").upsert(payload,{onConflict:"id"});
    if(error)return toast(error.message,true);
    siteSettings={...siteSettings,...payload}; applySiteSettings(); await logActivity("Mengubah Home / Website Settings"); toast("Home settings disimpan");
  }
  function fillSiteSettings(){
    $("siteSiteTitle").value=siteSettings.site_title||"";
    $("siteHeroEyebrow").value=siteSettings.hero_eyebrow||"";
    $("siteHeroTitle").value=siteSettings.hero_title||"";
    $("siteHeroHighlight").value=siteSettings.hero_highlight||"";
    $("siteHeroDescription").value=siteSettings.hero_description||"";
    $("siteLatestTitle").value=siteSettings.latest_title||"";
    $("siteFooterText").value=siteSettings.footer_text||"";
  }

  // Per-user theme
  const oldGetProfiles=getProfiles;
  getProfiles=async ids=>{
    const res=await oldGetProfiles(ids);
    if(!sb||!ids?.length)return res;
    const {data}=await sb.from("profiles").select("id,username,display_name,avatar_url,role,created_at,theme").in("id",[...new Set(ids.filter(Boolean))]);
    (data||[]).forEach(p=>{res[p.id]={...(res[p.id]||{}),...p}});
    return res;
  };
  function applyTheme(){
    const theme=currentProfile?.theme==="light"?"light":"dark";
    root.classList.toggle("light-theme",theme==="light");
    localStorage.setItem("fuyuko-theme",theme);
  }
  const oldRenderProfile=renderProfile;
  renderProfile=()=>{
    oldRenderProfile();
    if($("profileTheme"))$("profileTheme").value=currentProfile?.theme==="light"?"light":"dark";
    applyTheme();
  };
  $("profileTheme")?.addEventListener("change",async()=>{
    if(!requireAuth())return;
    const theme=$("profileTheme").value==="light"?"light":"dark";
    const {data,error}=await sb.from("profiles").update({theme,updated_at:iso()}).eq("id",currentUser.id).select().single();
    if(error)return toast(error.message,true);
    currentProfile=data; applyTheme(); toast("Tema disimpan");
  });
  applyTheme();

  // Gallery picker / storage
  async function listStorageFilesRecursive(bucket,prefix="",depth=0,out=[]){
    if(depth>6)return out;
    const {data,error}=await sb.storage.from(bucket).list(prefix,{limit:1000,sortBy:{column:"created_at",order:"desc"}});
    if(error)throw error;
    for(const item of (data||[])){
      if(!item?.name)continue;
      const path=prefix?`${prefix}/${item.name}`:item.name;
      if(item.id===null || item.metadata===null){
        await listStorageFilesRecursive(bucket,path,depth+1,out);
      }else out.push({...item,path});
    }
    return out;
  }
  async function loadGallery(){
    if(!requireAdmin())return [];
    try{
      const files=await listStorageFilesRecursive("addon-images");
      const {data:meta,error:metaError}=await sb.from("gallery_items").select("*").order("created_at",{ascending:false});
      if(metaError)throw metaError;
      const mm=Object.fromEntries((meta||[]).map(x=>[x.path,x]));
      const {data:addons}=await sb.from("addons").select("id,name,image_path");
      galleryCache=files.filter(x=>!x.path.startsWith("__trash/")).map(x=>{
        const url=publicUrl("addon-images",x.path);
        const usedBy=(addons||[]).filter(a=>a.image_path===url || a.image_path===x.path).map(a=>a.name);
        return {...x,path:x.path,meta:mm[x.path]||null,url,usedBy};
      });
      renderGallery();
      return galleryCache;
    }catch(e){toast(e.message||"Gagal memuat Gallery.",true);return []}
  }
  function renderGallery(){
    const q=($("gallerySearch")?.value||"").trim().toLowerCase();
    const list=galleryCache.filter(x=>(x.name+" "+x.path+" "+(x.meta?.title||"")+" "+(x.meta?.description||"")+" "+(x.usedBy||[]).join(" ")).toLowerCase().includes(q));
    $("galleryAdminGrid").innerHTML=list.map(x=>`<article class="gallery-admin-card">
      <div class="gallery-thumb-wrap"><img src="${esc(x.url)}" alt="${esc(x.meta?.title||x.name)}"><span class="gallery-type-badge">${esc((x.metadata?.mimetype||x.name.split('.').pop()||'IMG').replace('image/','').toUpperCase())}</span></div>
      <div class="gallery-info"><b>${esc(x.meta?.title||x.name)}</b><code>${esc(x.path)}</code><p class="muted">${esc(x.meta?.description||"")}</p>
      <div class="gallery-usage ${x.usedBy?.length?'is-used':''}">${x.usedBy?.length?`Used by: ${esc(x.usedBy.join(", "))}`:"Belum dipakai addon"}</div>
      <div class="gallery-meta muted">${x.metadata?.size?Math.ceil(x.metadata.size/1024)+" KB":""}${x.created_at?" · "+fmt(x.created_at):""}</div>
      <div class="gallery-actions"><button class="btn small" onclick="useGalleryImage('${encodeURIComponent(x.path)}')">Pilih</button>
      <button class="btn small ghost" onclick="editGallery('${encodeURIComponent(x.path)}')">Edit</button>
      <button class="btn small danger" onclick="deleteGallery('${encodeURIComponent(x.path)}')">Hapus</button></div></div>
    </article>`).join("")||'<p class="muted">Belum ada gambar di Storage.</p>';
  }
  window.useGalleryImage=encoded=>{
    const path=decodeURIComponent(encoded), item=galleryCache.find(x=>x.path===path);
    if(!item)return;
    selectedGalleryImagePath=item.url;window.fuyukoSelectedGalleryImagePath=item.url;
    if($("addonImageName"))$("addonImageName").textContent=`Gallery: ${item.meta?.title||item.name}`;
    document.querySelectorAll(".gallery-picker-modal").forEach(x=>x.remove());
    toast("Thumbnail dari Gallery dipilih");
  };
  window.editGallery=async encoded=>{
    if(!requireAdmin())return;
    const path=decodeURIComponent(encoded), item=galleryCache.find(x=>x.path===path);
    if(!item)return;
    const title=prompt("Nama gambar:",item.meta?.title||item.name); if(title===null)return;
    const description=prompt("Deskripsi gambar:",item.meta?.description||""); if(description===null)return;
    const {error}=await sb.from("gallery_items").upsert({path,title,description,updated_at:iso()},{onConflict:"path"});
    if(error)return toast(error.message,true);
    await logActivity("Mengedit Gallery",title); await loadGallery(); toast("Gallery diperbarui");
  };
  window.deleteGallery=async encoded=>{
    if(!requireAdmin()||!confirm("Hapus gambar ini? Jika sedang dipakai addon, thumbnail addon akan dikosongkan dan file masuk Trash."))return;
    const path=decodeURIComponent(encoded), item=galleryCache.find(x=>x.path===path);
    if(!item)return;
    const url=item.url;
    const {data:addons}=await sb.from("addons").select("id,name,image_path");
    const usedAddons=(addons||[]).filter(a=>a.image_path===url || a.image_path===path);
    const trashPath=`__trash/${crypto.randomUUID()}/${path.split("/").pop()}`;
    const mv=await sb.storage.from("addon-images").move(path,trashPath);
    if(mv.error)return toast(mv.error.message,true);
    await sb.from("file_trash").insert({bucket:"addon-images",original_path:path,trash_path:trashPath,addon_ids:usedAddons.map(a=>a.id),release_ids:[] ,deleted_by:currentUser.id,metadata:{title:item.meta?.title||item.name,description:item.meta?.description||""}});
    if(usedAddons.length)await sb.from("addons").update({image_path:"",updated_at:iso()}).in("id",usedAddons.map(a=>a.id));
    await sb.from("gallery_items").delete().eq("path",path);
    await logActivity("Menghapus gambar Gallery",path); await loadGallery(); await renderFeatured(); toast("Gambar dipindahkan ke Trash");
  };
  $("galleryUploadInput")?.addEventListener("change",async e=>{
    if(!requireAdmin())return; const f=e.target.files?.[0]; if(!f)return;
    if(f.size>5*1024*1024)return toast("Gambar maksimal 5 MB.",true);
    const path=`${currentUser.id}/${crypto.randomUUID()}_${cleanName(f.name)}`;
    const up=await sb.storage.from("addon-images").upload(path,f,{upsert:false,contentType:f.type});
    if(up.error)return toast(up.error.message,true);
    const title=prompt("Nama gambar:",f.name.replace(/\.[^.]+$/,""))??f.name;
    const {error}=await sb.from("gallery_items").insert({path,title,description:"",updated_at:iso()});
    if(error)return toast(error.message,true);
    await logActivity("Upload gambar Gallery",title); e.target.value=""; await loadGallery(); toast("Gambar masuk Gallery");
  });
  $("gallerySearch")?.addEventListener("input",renderGallery);

  function openGalleryPicker(){
    const old=document.querySelector(".gallery-picker-modal"); if(old)old.remove();
    const modal=document.createElement("div"); modal.className="modal gallery-picker-modal";
    modal.innerHTML=`<div class="modal-card"><button class="close" id="closeGalleryPicker">×</button><h2>Pilih dari Gallery</h2><div id="galleryPickerGrid" class="gallery-admin-grid"></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("#closeGalleryPicker").onclick=()=>modal.remove();
    modal.classList.remove("hidden");
    const grid=modal.querySelector("#galleryPickerGrid");
    const list=galleryCache.length?galleryCache:[];
    grid.innerHTML=list.map(x=>`<button type="button" class="gallery-admin-card" style="text-align:left" onclick="useGalleryImage('${encodeURIComponent(x.path)}')"><img src="${esc(x.url)}" alt=""><div class="gallery-info"><b>${esc(x.meta?.title||x.name)}</b></div></button>`).join("")||"<p class='muted'>Gallery kosong.</p>";
  }
  $("chooseGalleryImageBtn")?.addEventListener("click",async()=>{if(!requireAdmin())return;if(!galleryCache.length)await loadGallery();openGalleryPicker()});
  $("chooseTutorialGalleryBtn")?.addEventListener("click",async()=>{
    if(!requireAdmin())return;
    if(!galleryCache.length)await loadGallery();
    const old=document.querySelector(".gallery-picker-modal"); if(old)old.remove();
    const modal=document.createElement("div"); modal.className="modal gallery-picker-modal";
    modal.innerHTML=`<div class="modal-card"><button class="close" id="closeTutorialGallery">×</button><h2>Pilih Foto Tutorial</h2><div id="tutorialGalleryGrid" class="gallery-admin-grid"></div></div>`;
    document.body.appendChild(modal); modal.classList.remove("hidden");
    modal.querySelector("#closeTutorialGallery").onclick=()=>modal.remove();
    modal.querySelector("#tutorialGalleryGrid").innerHTML=galleryCache.map(x=>`<button type="button" class="gallery-admin-card" style="text-align:left" data-gallery-tutorial="${encodeURIComponent(x.path)}"><img src="${esc(x.url)}" alt=""><div class="gallery-info"><b>${esc(x.meta?.title||x.name)}</b></div></button>`).join("")||"<p class='muted'>Gallery kosong.</p>";
    modal.querySelectorAll("[data-gallery-tutorial]").forEach(b=>b.onclick=()=>{const x=galleryCache.find(g=>g.path===decodeURIComponent(b.dataset.galleryTutorial));if(x){$("tutorialImageUrl").value=x.url;modal.remove();toast("Foto tutorial dipilih")}})
  });

  let selectedGalleryImagePath=null;window.fuyukoSelectedGalleryImagePath=null;
  const originalUploadAddonImage=uploadAddonImage;
  uploadAddonImage=async file=>{
    if(window.fuyukoSelectedGalleryImagePath){const u=window.fuyukoSelectedGalleryImagePath;window.fuyukoSelectedGalleryImagePath=null;selectedGalleryImagePath=null;return u}
    return originalUploadAddonImage(file);
  };
  $("addonImageFile")?.addEventListener("change",()=>{if($("addonImageFile").files?.length){selectedGalleryImagePath=null;window.fuyukoSelectedGalleryImagePath=null}});

  // File Manager
  async function loadFileManager(){
    if(!requireAdmin())return;
    let rows=[];
    try{ rows=await listStorageFilesRecursive("addon-files"); }
    catch(e){ return toast(e.message||"Gagal memuat File Manager.",true); }
    const {data:releases}=await sb.from("addon_releases").select("id,addon_id,version,file_name,file_path").eq("download_mode","download_here");
    const addonMap={}; const ids=[...(releases||[]).map(r=>r.addon_id)]; const {data:addons}=ids.length?await sb.from("addons").select("id,name").in("id",ids):{data:[]};
    (addons||[]).forEach(a=>addonMap[a.id]=a.name);
    fileCache=rows.map(x=>{const uses=(releases||[]).filter(r=>storagePathFromUrl("addon-files",r.file_path)===x.path);return {...x,uses,usedBy:uses.map(r=>addonMap[r.addon_id]||"Addon")}}).filter(x=>!x.path.startsWith("__trash/"));
    renderFileManager(); await loadTrash();
  }
  function renderFileManager(){
    const q=($("fileManagerSearch")?.value||"").trim().toLowerCase();
    const list=fileCache.filter(x=>x.path.toLowerCase().includes(q)||(x.file?.name||x.name||"").toLowerCase().includes(q));
    $("fileManagerList").innerHTML=list.map(x=>`<div class="file-manager-row"><div class="file-manager-main"><b>${esc(x.name)}</b><code>${esc(x.path)}</code><span class="muted">${x.uses.length?"Used by: "+esc(x.usedBy.join(", ")):"Belum dipakai"} · ${x.metadata?.size?Math.ceil(x.metadata.size/1024)+" KB":""}</span></div><div class="actions"><button class="btn small" onclick="renameManagedFile('${encodeURIComponent(x.path)}')">Rename/Move</button><button class="btn small danger" onclick="trashManagedFile('${encodeURIComponent(x.path)}')">Hapus</button></div></div>`).join("")||'<p class="muted">Tidak ada file.</p>';
  }
  window.renameManagedFile=async encoded=>{
    if(!requireAdmin())return; const oldPath=decodeURIComponent(encoded), item=fileCache.find(x=>x.path===oldPath); if(!item)return;
    const np=prompt("Path baru relatif ke addon-files:",oldPath); if(!np||np===oldPath)return;
    const newPath=np.replace(/^\/+/,"").replace(/\.\./g,"");
    const mv=await sb.storage.from("addon-files").move(oldPath,newPath); if(mv.error)return toast(mv.error.message,true);
    for(const r of item.uses){const newUrl=publicUrl("addon-files",newPath);await sb.from("addon_releases").update({file_path:newUrl}).eq("id",r.id)}
    await logActivity("Rename/Move file",`${oldPath} → ${newPath}`); await loadFileManager(); toast("File dipindahkan");
  };
  window.trashManagedFile=async encoded=>{
    if(!requireAdmin())return; const path=decodeURIComponent(encoded), item=fileCache.find(x=>x.path===path); if(!item)return;
    const msg=item.uses.length?`File ini dipakai ${item.uses.length} release. Menghapusnya akan membuat file pada addon tidak tersedia. Lanjutkan?`:"Pindahkan file ke Trash?";
    if(!confirm(msg))return;
    const trashPath=`__trash/${crypto.randomUUID()}/${path.split("/").pop()}`;
    const mv=await sb.storage.from("addon-files").move(path,trashPath); if(mv.error)return toast(mv.error.message,true);
    await sb.from("file_trash").insert({bucket:"addon-files",original_path:path,trash_path:trashPath,release_ids:item.uses.map(r=>r.id),addon_ids:[],deleted_by:currentUser.id,metadata:{}});
    if(item.uses.length)await sb.from("addon_releases").update({file_path:"",file_name:null}).in("id",item.uses.map(r=>r.id));
    await logActivity("Menghapus file addon",path); await loadFileManager(); toast("File dipindahkan ke Trash");
  };
  async function loadTrash(){
    const {data,error}=await sb.from("file_trash").select("*").order("deleted_at",{ascending:false}).range(0,500);
    if(error)return;
    $("fileTrashList").innerHTML=(data||[]).map(x=>`<div class="file-manager-row"><div><b>${esc(x.original_path)}</b><div class="muted">${esc(x.bucket)} · ${fmt(x.deleted_at)}</div></div><div class="actions"><button class="btn small" onclick="restoreTrash('${x.id}')">Restore</button><button class="btn small danger" onclick="deleteTrashPermanently('${x.id}')">Delete Permanently</button></div></div>`).join("")||'<p class="muted">Trash kosong.</p>';
  }
  window.restoreTrash=async id=>{
    if(!requireAdmin())return; const {data:t,error}=await sb.from("file_trash").select("*").eq("id",id).single(); if(error)return toast(error.message,true);
    const mv=await sb.storage.from(t.bucket).move(t.trash_path,t.original_path); if(mv.error)return toast(mv.error.message,true);
    const url=publicUrl(t.bucket,t.original_path);
    if(t.bucket==="addon-files"&&(t.release_ids||[]).length)await sb.from("addon_releases").update({file_path:url}).in("id",t.release_ids);
    if(t.bucket==="addon-images"&&(t.addon_ids||[]).length)await sb.from("addons").update({image_path:url,updated_at:iso()}).in("id",t.addon_ids);
    if(t.bucket==="addon-images")await sb.from("gallery_items").upsert({path:t.original_path,title:t.metadata?.title||t.original_path.split("/").pop(),description:t.metadata?.description||"",updated_at:iso()},{onConflict:"path"});
    await sb.from("file_trash").delete().eq("id",id); await logActivity("Restore file",t.original_path); await loadFileManager(); await loadGallery(); await renderFeatured(); toast("File dipulihkan");
  };
  window.deleteTrashPermanently=async id=>{
    if(!requireAdmin()||!confirm("Hapus permanen? Tindakan ini tidak bisa dibatalkan."))return;
    const {data:t,error}=await sb.from("file_trash").select("*").eq("id",id).single(); if(error)return toast(error.message,true);
    const rm=await sb.storage.from(t.bucket).remove([t.trash_path]); if(rm.error)return toast(rm.error.message,true);
    await sb.from("file_trash").delete().eq("id",id); await logActivity("Hapus permanen file",t.original_path); await loadFileManager(); toast("File dihapus permanen");
  };
  $("fileManagerSearch")?.addEventListener("input",renderFileManager);
  $("refreshFileManagerBtn")?.addEventListener("click",loadFileManager);

  // Tutorials / Help
  async function loadTutorials(admin=false){
    let q=sb.from("tutorials").select("*").order("updated_at",{ascending:false});
    if(!admin)q=q.eq("is_published",true);
    const {data,error}=await q.range(0,999);
    if(error){toast(error.message,true);return[]}
    tutorialCache=data||[];
    if(admin)renderTutorialAdmin(); else renderHelpList();
    return tutorialCache;
  }
  function tutorialCard(t,admin=false){
    return `<article class="${admin?'tutorial-admin-card':'help-card'}"><div><h3>${esc(t.title)}</h3><p class="muted">${t.is_published?'Published':'Draft'} · ${fmtDateOnly(t.updated_at)}</p>${admin?'':`<p class="muted">${esc((t.intro||"").slice(0,180))}${(t.intro||"").length>180?"…":""}</p>`}</div>${admin?`<div class="actions"><button class="btn small" onclick="editTutorial('${t.id}')">Edit</button><button class="btn small ${t.is_published?'ghost':'orange'}" onclick="toggleTutorialPublish('${t.id}',${!t.is_published})">${t.is_published?'Unpublish':'Publish'}</button><button class="btn small danger" onclick="deleteTutorial('${t.id}')">Hapus</button></div>`:`<button class="btn small" onclick="openTutorial('${t.id}')">Buka</button>`}</article>`;
  }
  function renderTutorialAdmin(){$("tutorialAdminList").innerHTML=tutorialCache.map(t=>tutorialCard(t,true)).join("")||'<p class="muted">Belum ada tutorial.</p>'}
  function renderHelpList(){$("helpList").innerHTML=tutorialCache.map(t=>tutorialCard(t,false)).join("")||'<div class="panel"><p class="muted">Belum ada tutorial.</p></div>'}
  function tutorialBody(t){
    const yt=youtubeId(t.youtube_url);
    return `<h2>${esc(t.title)}</h2><div class="help-content">${t.intro?`<p>${esc(t.intro).replace(/\n/g,"<br>")}</p>`:""}${t.image_url?`<img src="${esc(t.image_url)}" alt="${esc(t.title)}">`:""}${yt?`<iframe src="https://www.youtube.com/embed/${encodeURIComponent(yt)}" title="YouTube tutorial" loading="lazy" allowfullscreen></iframe>`:""}${t.link_url?`<p><a href="${esc(t.link_url)}" target="_blank" rel="noopener">${esc(t.link_label||"Buka Link")}</a></p>`:""}${t.extra?`<p>${esc(t.extra).replace(/\n/g,"<br>")}</p>`:""}</div>`;
  }
  window.openTutorial=id=>{const t=tutorialCache.find(x=>x.id===id);if(!t)return;$("helpDetail").innerHTML=tutorialBody(t);$("helpDetail").classList.remove("hidden");$("helpList").classList.add("hidden");window.scrollTo({top:0,behavior:"smooth"})};
  window.editTutorial=id=>{const t=tutorialCache.find(x=>x.id===id);if(!t)return;$("editTutorialId").value=t.id;$("tutorialTitle").value=t.title;$("tutorialIntro").value=t.intro||"";$("tutorialImageUrl").value=t.image_url||"";$("tutorialYoutube").value=t.youtube_url||"";$("tutorialLinkUrl").value=t.link_url||"";$("tutorialLinkLabel").value=t.link_label||"";$("tutorialExtra").value=t.extra||"";$("tutorialPublished").checked=!!t.is_published;$("tutorialForm").classList.remove("hidden");$("tutorialForm").scrollIntoView({behavior:"smooth"})};
  window.toggleTutorialPublish=async(id,p)=>{if(!requireAdmin())return;const {error}=await sb.from("tutorials").update({is_published:p,updated_at:iso()}).eq("id",id);if(error)return toast(error.message,true);await logActivity(p?"Publish tutorial":"Unpublish tutorial");await loadTutorials(true);toast("Status tutorial diperbarui")};
  window.deleteTutorial=async id=>{if(!requireAdmin()||!confirm("Hapus tutorial ini?"))return;const {error}=await sb.from("tutorials").delete().eq("id",id);if(error)return toast(error.message,true);await logActivity("Hapus tutorial",id);await loadTutorials(true);toast("Tutorial dihapus")};
  $("newTutorialBtn")?.addEventListener("click",()=>{$("editTutorialId").value="";["tutorialTitle","tutorialIntro","tutorialImageUrl","tutorialYoutube","tutorialLinkUrl","tutorialLinkLabel","tutorialExtra"].forEach(id=>$(id).value="");$("tutorialPublished").checked=true;$("tutorialForm").classList.remove("hidden")});
  $("cancelTutorialBtn")?.addEventListener("click",()=>$("tutorialForm").classList.add("hidden"));
  $("tutorialForm")?.addEventListener("submit",async e=>{
    e.preventDefault();if(!requireAdmin())return;
    const id=$("editTutorialId").value,p={title:$("tutorialTitle").value.trim(),intro:$("tutorialIntro").value.trim(),image_url:$("tutorialImageUrl").value.trim(),youtube_url:$("tutorialYoutube").value.trim(),link_url:$("tutorialLinkUrl").value.trim(),link_label:$("tutorialLinkLabel").value.trim(),extra:$("tutorialExtra").value.trim(),is_published:$("tutorialPublished").checked,updated_at:iso()};
    if(!p.title)return toast("Judul tutorial wajib diisi.",true);
    const res=id?await sb.from("tutorials").update(p).eq("id",id):await sb.from("tutorials").insert({...p,created_by:currentUser.id});
    if(res.error)return toast(res.error.message,true); await logActivity(id?"Edit tutorial":"Buat tutorial",p.title); $("tutorialForm").classList.add("hidden"); await loadTutorials(true); toast("Tutorial disimpan");
  });

  // Activity log
  async function loadActivity(){
    if(!requireAdmin())return;
    const {data,error}=await sb.from("activity_logs").select("*,profiles(username,display_name)").order("created_at",{ascending:false}).range(0,300);
    if(error)return toast(error.message,true);
    activityCache=data||[];
    $("activityLogList").innerHTML=activityCache.map(x=>`<div class="activity-row"><div><b>${esc(x.action)}</b><div class="muted">${esc(x.details||"")}</div></div><time class="muted">${fmt(x.created_at)}</time></div>`).join("")||'<p class="muted">Belum ada aktivitas.</p>';
  }
  $("refreshActivityBtn")?.addEventListener("click",loadActivity);

  // Global search
  async function globalSearch(q){
    q=q.trim().toLowerCase(); if(!q){$("globalSearchResults").innerHTML="";return}
    const [a,t,n,r]=await Promise.all([
      sb.from("addons").select("id,name,description").ilike("name",`%${q}%`).range(0,30),
      sb.from("tutorials").select("id,title,intro").eq("is_published",true).ilike("title",`%${q}%`).range(0,30),
      sb.from("announcements").select("id,title,body").eq("is_published",true).ilike("title",`%${q}%`).range(0,30),
      sb.from("requests").select("id,title,description,visibility").eq("visibility","public").ilike("title",`%${q}%`).range(0,30)
    ]);
    let out="";
    (a.data||[]).forEach(x=>out+=`<div class="panel"><h3>${esc(x.name)}</h3><p class="muted">${esc(x.description).slice(0,160)}</p><button class="btn small" onclick="openAddon('${x.id}')">Open Addon</button></div>`);
    (t.data||[]).forEach(x=>out+=`<div class="panel"><h3>Help · ${esc(x.title)}</h3><button class="btn small" onclick="showPage('help');setTimeout(()=>openTutorial('${x.id}'),50)">Open</button></div>`);
    (n.data||[]).forEach(x=>out+=`<div class="panel"><h3>Announcement · ${esc(x.title)}</h3><p class="muted">${esc(x.body).slice(0,160)}</p></div>`);
    (r.data||[]).forEach(x=>out+=`<div class="panel"><h3>Request · ${esc(x.title)}</h3><p class="muted">${esc(x.description).slice(0,160)}</p></div>`);
    $("globalSearchResults").innerHTML=out||'<div class="panel"><p class="muted">Tidak ditemukan.</p></div>';
  }
  $("globalSearchInput")?.addEventListener("input",e=>{clearTimeout(globalSearchInputTimer);globalSearchInputTimer=setTimeout(()=>globalSearch(e.target.value),250)});
  let globalSearchInputTimer;

  // Notifications from recent public changes
  async function loadNotifications(){
    const [a,n,t]=await Promise.all([
      sb.from("addons").select("id,name,updated_at").order("updated_at",{ascending:false}).limit(8),
      sb.from("announcements").select("id,title,created_at").eq("is_published",true).order("created_at",{ascending:false}).limit(8),
      sb.from("tutorials").select("id,title,updated_at").eq("is_published",true).order("updated_at",{ascending:false}).limit(8)
    ]);
    const items=[
      ...(a.data||[]).map(x=>({date:x.updated_at,title:`Addon diperbarui: ${x.name}`,id:x.id,type:"Addon",go:()=>openAddon(x.id)})),
      ...(n.data||[]).map(x=>({date:x.created_at,title:`Announcement: ${x.title}`,id:x.id,type:"News",go:()=>showPage("announcements")})),
      ...(t.data||[]).map(x=>({date:x.updated_at,title:`Tutorial baru: ${x.title}`,id:x.id,type:"Help",go:()=>showPage("help")}))
    ].sort((x,y)=>new Date(y.date)-new Date(x.date)).slice(0,20);
    $("notificationList").innerHTML=items.map((x,i)=>`<button class="activity-row notification-item" data-notification-type="${esc(x.type)}" data-notification-id="${esc(x.id||"")} " style="width:100%;text-align:left"><div><b>${esc(x.title)}</b><div class="muted">${x.type}</div></div><time class="muted">${fmt(x.date)}</time></button>`).join("")||'<p class="muted">Belum ada notifikasi.</p>';
    $("notificationList").querySelectorAll(".notification-item").forEach(b=>b.onclick=()=>{const type=b.dataset.notificationType,id=b.dataset.notificationId;if(type==="Addon")openAddon(id);else if(type==="Help"){showPage("help");setTimeout(()=>openTutorial(id),50)}else showPage("announcements")});
    $("notificationDot")?.classList.toggle("hidden",!items.length);
  }

  // Structured changelog helper
  function composeChangelog(base,added,changed,fixed){
    const parts=[]; if(base.trim())parts.push(base.trim());
    if(added.trim())parts.push(`Added\n• ${added.trim()}`);
    if(changed.trim())parts.push(`Changed\n• ${changed.trim()}`);
    if(fixed.trim())parts.push(`Fixed\n• ${fixed.trim()}`);
    return parts.join("\n\n");
  }
  const createBtn=$("createAddonBtn");
  if(createBtn){
    const old=createBtn.onclick;
    createBtn.onclick=async()=>{ $("addonChangelog").value=composeChangelog($("addonChangelog").value,$("addonAdded").value,$("addonChanged").value,$("addonFixed").value); return old(); };
  }
  const saveVerBtn=$("saveNewVersionBtn");
  if(saveVerBtn){
    const old=saveVerBtn.onclick;
    saveVerBtn.onclick=async()=>{ $("newReleaseChangelog").value=composeChangelog($("newReleaseChangelog").value,$("newReleaseAdded").value,$("newReleaseChanged").value,$("newReleaseFixed").value); return old(); };
  }

  // Admin wrappers / tab loaders
  const oldLoadAdmin=loadAdmin;
  loadAdmin=async()=>{
    await oldLoadAdmin();
    if(currentProfile?.role==="admin") await loadSiteSettings();
  };
  document.querySelectorAll(".admin-tabs .tab").forEach(b=>b.addEventListener("click",async()=>{
    const t=b.dataset.tab;
    if(t==="manageFiles")await loadFileManager();
    if(t==="manageGallery")await loadGallery();
    if(t==="manageTutorials")await loadTutorials(true);
    if(t==="manageActivity")await loadActivity();
    if(t==="manageOthers") {await loadSiteSettings();fillSiteSettings();}
  }));
  $("saveSiteTextBtn")?.addEventListener("click",saveSiteSettings);

  const oldShowPage=showPage;
  showPage=function(id){
    oldShowPage(id);
    if(id==="help")loadTutorials(false);
    if(id==="search")$("globalSearchInput")?.focus();
    if(id==="notifications")loadNotifications();
  };

  // Make theme follow profile after session changes.
  const oldRefreshUser=refreshUser;
  refreshUser=async session=>{await oldRefreshUser(session);applyTheme();};

  // Keep selected gallery path clean on form reset.
  const oldResetAddonForm=resetAddonForm;
  resetAddonForm=()=>{selectedGalleryImagePath=null;window.fuyukoSelectedGalleryImagePath=null;oldResetAddonForm();};

  loadSiteSettings().catch(()=>{});
})();
