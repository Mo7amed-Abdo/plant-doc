// farmerprofile.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('farmer')) return;
  populateSidebarUser(); setupLogout();
  await Promise.all([loadProfile(), loadFarmStats()]);
  setupForms(); setupAvatar();
});

async function loadProfile() {
  try {
    const p = (await api.get('/farmer/profile')).data;
    setVal('full_name',p.full_name); setVal('email',p.email); setVal('phone',p.phone||'');
    setVal('location',p.location||''); setVal('bio',p.bio||'');
    setText('[data-profile-name]',p.full_name);
    setText('[data-profile-location]',p.location||'Not set');
    setText('[data-profile-joined]',p.joined_at?`Joined ${formatDate(p.joined_at)}`:'');
    const inits=(p.full_name||'F').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    setText('[data-profile-initials]',inits);
    if(p.avatar) document.querySelectorAll('[data-profile-avatar]').forEach(img=>{if(img.tagName==='IMG')img.src=p.avatar;});
  } catch(e) { showToast('Failed to load profile','error'); }
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
      ['full_name','phone','location','bio'].forEach(k=>{const v=getVal(k);if(v)fd.append(k,v);});
      const ai=document.getElementById('avatar-input'); if(ai?.files[0]) fd.append('avatar',ai.files[0]);
      await api.put('/farmer/profile',fd);
      showToast('Profile updated!','success');
      const res=await api.get('/farmer/profile'); Auth.setSession({token:Auth.getToken(),user:res.data}); populateSidebarUser();
      document.querySelectorAll('[data-profile-avatar]').forEach(img => {
        if (img.tagName === 'IMG' && img.src) {
          img.src = img.src.split('?')[0] + '?t=' + Date.now();
        }
      });
    } catch(err){showToast(err.message||'Update failed','error');}
    finally{setBtnLoad(btn,false,'Save Changes');}
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
    setBtnLoad(btn,true);
    try{await api.post('/auth/change-password',{current_password:cur,new_password:nw}); showToast('Password changed!','success'); pwf.reset();}
    catch(err){showToast(err.message||'Failed','error');}
    finally{setBtnLoad(btn,false,'Update Password');}
  });
}

function setupAvatar() {
  const ai=document.getElementById('avatar-input')||(() => {const i=document.createElement('input');i.type='file';i.id='avatar-input';i.accept='image/*';i.style.display='none';document.body.appendChild(i);return i;})();
  document.querySelectorAll('[data-profile-avatar],[data-avatar-upload]').forEach(el=>{el.style.cursor='pointer';el.addEventListener('click',()=>ai.click());});
  ai.addEventListener('change',()=>{if(!ai.files[0])return;const url=URL.createObjectURL(ai.files[0]);document.querySelectorAll('[data-profile-avatar]').forEach(img=>{if(img.tagName==='IMG')img.src=url;});showToast('Save profile to apply avatar','info');});
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

const getVal = k => document.querySelector(`[name="${k}"],#${k}`)?.value?.trim()||'';
const setVal = (k,v) => { const el=document.querySelector(`[name="${k}"],#${k}`); if(el&&v!=null) el.value=v; };
const setText = (sel,txt) => document.querySelectorAll(sel).forEach(el=>el.textContent=txt||'');
const setBtnLoad = (btn,on,label='Save Changes') => { if(!btn)return; btn.disabled=on; btn.textContent=on?'Saving…':label; };
