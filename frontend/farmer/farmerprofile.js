// farmerprofile.js
let currentProfile = null;
let pendingAvatarFile = null;
let pendingAvatarPreviewUrl = null;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadProfile(), loadFarmStats()]);
  setupForms(); setupAvatar();
});

async function loadProfile() {
  try {
    const p = (await api.get('/farmer/profile')).data;
    currentProfile = p;
    applyProfileToView(p);
    persistProfileSession(p);
  } catch(e) { showToast('Failed to load profile','error'); }
}

function applyProfileToView(p) {
  setVal('full_name',p.full_name||'');
  setVal('email',p.email||'');
  setVal('phone',p.phone||'');
  setVal('location',p.location||'');
  setVal('bio',p.bio||'');
  setText('[data-profile-name]',p.full_name||'Farmer');
  setText('[data-profile-location]',p.location||'Not set');
  setText('[data-profile-joined]',p.joined_at?`Joined ${formatDate(p.joined_at)}`:'');
  const inits=(p.full_name||'F').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  setText('[data-profile-initials]',inits);
  updateProfileImages(p.avatar||'', inits);
}

async function loadFarmStats() {
  try {
    const [fRes,dRes] = await Promise.all([api.get('/farmer/fields'),api.get('/diagnoses?limit=200')]);
    const fields=fRes.data||[], diags=dRes.data||[];
    const totalCrops=fields.reduce((s,f)=>s+(f.crops_count||0),0);
    const reviewed=diags.filter(d=>d.status==='expert_reviewed').length;
    const rate=diags.length?Math.round(reviewed/diags.length*100):0;
    setText('[data-stat="total-fields"]',fields.length);
    setText('[data-stat="crops-monitored"]',totalCrops.toLocaleString());
    setText('[data-stat="recovery-rate"]',`${rate}%`);
    const bar=document.querySelector('[data-recovery-bar]'); if(bar) bar.style.width=`${rate}%`;
    renderFields(fields);
  } catch(_) {}
}

function renderFields(fields) {
  const con=document.getElementById('fields-list')||document.querySelector('[data-fields-list]');
  if (!con) return;
  if (!fields.length) {
    con.innerHTML=`<p class="text-sm text-on-surface-variant mb-3">No fields yet.</p><button data-add-field class="w-full py-2 border border-dashed border-outline-variant rounded-xl text-sm font-medium text-primary hover:bg-primary-fixed/10 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">add</span>Add Field</button>`;
    con.querySelector('[data-add-field]')?.addEventListener('click',openAddField);
    return;
  }
  con.innerHTML = fields.map(f=>`
    <div class="flex items-center justify-between py-2 border-b border-surface-variant last:border-0">
      <div><p class="text-sm font-semibold text-on-surface">${f.name}</p><p class="text-xs text-on-surface-variant">${f.crop_type||'Unknown'} · ${f.area_acres?f.area_acres+' acres':''}</p></div>
      <button data-del-field="${f._id}" class="text-on-surface-variant hover:text-error transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
    </div>`).join('')+`<button data-add-field class="mt-3 w-full py-2 border border-dashed border-outline-variant rounded-xl text-sm font-medium text-primary hover:bg-primary-fixed/10 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px]">add</span>Add Field</button>`;
  con.querySelectorAll('[data-del-field]').forEach(btn=>btn.addEventListener('click',()=>delField(btn.dataset.delField)));
  con.querySelector('[data-add-field]')?.addEventListener('click',openAddField);
}

function setupForms() {
  // Personal form
  const pf = document.getElementById('personal-form')||document.querySelector('[data-form="personal"]');
  if (pf) pf.addEventListener('submit', async e => {
    e.preventDefault(); const btn=pf.querySelector('button[type="submit"]'); setBtnLoad(btn,true);
    try {
      const fd=new FormData();
      ['full_name','phone','location','bio'].forEach(k=>{
        const v=getVal(k);
        if (v !== null) fd.append(k, v);
      });
      if (pendingAvatarFile) fd.append('avatar', pendingAvatarFile);
      await api.put('/farmer/profile',fd);
      showToast('Profile updated!','success');
      const res=await api.get('/farmer/profile');
      currentProfile = res.data;
      persistProfileSession(currentProfile);
      applyProfileToView(currentProfile);
      clearPendingAvatar();
    } catch(err){showToast(err.message||'Update failed','error');}
    finally{setBtnLoad(btn,false,'Save Changes');}
  });

  // Discard changes
  document.getElementById('discard-btn')?.addEventListener('click', () => {
    if (!currentProfile) return;
    clearPendingAvatar();
    applyProfileToView(currentProfile);
    showToast('Changes discarded','info');
  });

  // Password form
  const pwf=document.getElementById('password-form')||document.querySelector('[data-form="security"]');
  if (pwf) pwf.addEventListener('submit', async e => {
    e.preventDefault(); const btn=pwf.querySelector('button[type="submit"]');
    const cur=pwf.querySelector('[name="current_password"],#current_password,#currentPassword')?.value;
    const nw=pwf.querySelector('[name="new_password"],#new_password,#newPassword')?.value;
    const conf=pwf.querySelector('[name="confirm_password"],#confirm_password,#confirmPassword')?.value;
    if(!cur||!nw){showToast('Fill in all fields','error');return;}
    if(nw!==conf){showToast('Passwords do not match','error');return;}
    if(nw.length<8){showToast('Min 8 characters','error');return;}
    setBtnLoad(btn,true,'Update Password');
    try{await api.post('/auth/change-password',{current_password:cur,new_password:nw}); showToast('Password changed!','success'); pwf.reset();}
    catch(err){showToast(err.message||'Failed','error');}
    finally{setBtnLoad(btn,false,'Update Password');}
  });
}

function setupAvatar() {
  const ai=document.getElementById('avatar-input')||(() => {const i=document.createElement('input');i.type='file';i.id='avatar-input';i.accept='image/*';i.style.display='none';document.body.appendChild(i);return i;})();
  document.querySelectorAll('[data-profile-avatar],[data-avatar-upload]').forEach(el=>{el.style.cursor='pointer';el.addEventListener('click',()=>ai.click());});
  ai.addEventListener('change',()=>{
    const file = ai.files && ai.files[0];
    if(!file) return;
    ai.value='';
    const err = validateAvatarFile(file);
    if (err) { showToast(err,'error'); return; }

    pendingAvatarFile = file;
    resetPendingPreview();
    pendingAvatarPreviewUrl = URL.createObjectURL(file);

    const inits = (getVal('full_name') || currentProfile?.full_name || 'F')
      .split(' ').filter(Boolean).map(n=>n[0]).join('').toUpperCase().slice(0,2);
    updateProfileImages(pendingAvatarPreviewUrl, inits);
    showToast('Image selected. Save changes to upload it.','info');
  });
}

function openAddField() {
  const m=document.createElement('div'); m.className='fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4';
  m.innerHTML=`<div class="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
    <h3 class="text-lg font-bold text-on-surface mb-4">Add New Field</h3>
    <div class="space-y-3">
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Name *</label><input id="fn" type="text" placeholder="e.g. Sector B" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Crop Type</label><input id="fc" type="text" placeholder="e.g. Tomato" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-sm font-medium text-on-surface mb-1.5">Area (acres)</label><input id="fa" type="number" min="0" placeholder="0" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
        <div><label class="block text-sm font-medium text-on-surface mb-1.5">Crops Count</label><input id="fcc" type="number" min="0" placeholder="0" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
      </div>
      <div><label class="block text-sm font-medium text-on-surface mb-1.5">Location</label><input id="fl" type="text" placeholder="e.g. North Farm" class="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:ring-1 focus:ring-primary bg-surface-container-lowest"/></div>
    </div>
    <div class="flex gap-3 mt-5"><button onclick="this.closest('.fixed').remove()" class="flex-1 py-2.5 border border-outline-variant rounded-xl text-sm font-medium text-on-surface-variant">Cancel</button><button id="save-field" class="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-semibold">Add Field</button></div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  m.querySelector('#save-field').addEventListener('click',async()=>{
    const name=m.querySelector('#fn').value.trim(); if(!name){showToast('Name required','error');return;}
    const btn=m.querySelector('#save-field'); setBtnLoad(btn,true);
    try{
      await api.post('/farmer/fields',{name,crop_type:m.querySelector('#fc').value.trim()||null,area_acres:parseFloat(m.querySelector('#fa').value)||null,crops_count:parseInt(m.querySelector('#fcc').value)||0,location:m.querySelector('#fl').value.trim()||null});
      m.remove(); showToast('Field added!','success'); await loadFarmStats();
    }catch(err){showToast(err.message||'Failed','error');setBtnLoad(btn,false,'Add Field');}
  });
}

async function delField(id) {
  if(!await confirmDialog('Delete this field?')) return;
  try{await api.delete(`/farmer/fields/${id}`); showToast('Deleted','success'); await loadFarmStats();}
  catch(err){showToast('Delete failed','error');}
}

// Returns '' for existing inputs with empty value; returns null when the element doesn't exist.
const getVal = k => {
  const el = document.querySelector(`[name="${k}"],#${k}`);
  if (!el) return null;
  return (el.value || '').trim();
};
const setVal = (k,v) => { const el=document.querySelector(`[name="${k}"],#${k}`); if(el&&v!=null) el.value=v; };
const setText = (sel,txt) => document.querySelectorAll(sel).forEach(el=>el.textContent=txt||'');
const setBtnLoad = (btn,on,label='Save Changes') => { if(!btn)return; btn.disabled=on; btn.textContent=on?'Saving...':label; };

function validateAvatarFile(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) return 'Please select an image file';
  if (file.size > MAX_AVATAR_BYTES) return 'Image must be under 5MB';
  return '';
}

function resetPendingPreview() {
  if (pendingAvatarPreviewUrl) {
    URL.revokeObjectURL(pendingAvatarPreviewUrl);
    pendingAvatarPreviewUrl = null;
  }
}

function clearPendingAvatar() {
  pendingAvatarFile = null;
  resetPendingPreview();
}

function persistProfileSession(profile) {
  const existingUser = Auth.getUser() || {};
  const mergedUser = {
    ...existingUser,
    full_name: profile.full_name || existingUser.full_name,
    email: profile.email || existingUser.email,
    phone: profile.phone ?? existingUser.phone,
    role: profile.role || existingUser.role,
    avatar: profile.avatar || existingUser.avatar || null,
  };
  localStorage.setItem('plantdoc_user', JSON.stringify(mergedUser));
  localStorage.setItem('plantdoc_profile', JSON.stringify(profile));
  populateSidebarUser();
}

function initialsAvatarDataUrl(initials) {
  const safe = String(initials || 'F').slice(0, 2).toUpperCase();
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e8f5e9"/>
      <stop offset="1" stop-color="#c8e6c9"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="48" fill="url(#g)"/>
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="30"
        font-weight="700" fill="#0f5132">${safe}</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function updateProfileImages(src, initials) {
  const fallback = initialsAvatarDataUrl(initials || 'F');
  document.querySelectorAll('[data-profile-avatar]').forEach((el) => {
    if (el.tagName !== 'IMG') return;
    el.onerror = null;
    el.src = fallback;
    if (src) {
      el.src = src;
      el.onerror = () => {
        el.onerror = null;
        el.src = fallback;
      };
    }
  });
}
