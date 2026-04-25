// expertprofile.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('expert')) return;
  populateSidebarUser(); setupLogout();
  await loadProfile();
  setupForms();
});

async function loadProfile() {
  try {
    const p = (await api.get('/expert/profile')).data;
    setVal('full_name',p.full_name); setVal('email',p.email); setVal('phone',p.phone||'');
    setVal('location',p.location||''); setVal('bio',p.bio||'');
    setVal('years_experience',p.years_experience||0);
    // Specialization is read-only
    const specEl=document.querySelector('[name="specialization"],#specialization');
    if(specEl){specEl.value=p.specialization||''; specEl.readOnly=true; specEl.classList.add('cursor-not-allowed','bg-surface-container-low');}
    // Tags
    const tagsEl=document.querySelector('[name="expertise_tags"],#expertise_tags');
    if(tagsEl) tagsEl.value=(p.expertise_tags||[]).join(', ');
    // Display
    setText('[data-profile-name]',p.full_name);
    setText('[data-profile-specialization]',p.specialization||'');
    setText('[data-profile-location]',p.location||'Not set');
    setText('[data-stat="cases-reviewed"]',p.cases_reviewed||0);
    setText('[data-stat="accuracy-rate"]',`${p.accuracy_rate||0}%`);
    const bar=document.querySelector('[data-accuracy-bar]');if(bar)bar.style.width=`${p.accuracy_rate||0}%`;
    const inits=(p.full_name||'E').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    setText('[data-profile-initials]',inits);
    if(p.avatar) document.querySelectorAll('[data-profile-avatar]').forEach(img=>{if(img.tagName==='IMG')img.src=p.avatar;});
  } catch(e){showToast('Failed to load profile','error');}
}

function setupForms() {
  const pf=document.getElementById('personal-form')||document.querySelector('form');
  if(pf) pf.addEventListener('submit',async e=>{
    e.preventDefault(); const btn=pf.querySelector('button[type="submit"]'); setBtnLoad(btn,true);
    try{
      const fd=new FormData();
      ['full_name','phone','location','bio','years_experience'].forEach(k=>{const v=getVal(k);if(v)fd.append(k,v);});
      const tags=getVal('expertise_tags'); if(tags) fd.append('expertise_tags',tags);
      const ai=document.getElementById('avatar-input');if(ai?.files[0])fd.append('avatar',ai.files[0]);
      await api.put('/expert/profile',fd);
      showToast('Profile updated!','success');
      const res=await api.get('/expert/profile'); Auth.setSession({token:Auth.getToken(),user:res.data}); populateSidebarUser();
    }catch(err){showToast(err.message||'Update failed','error');}
    finally{setBtnLoad(btn,false,'Save Changes');}
  });
  const pwf=document.getElementById('password-form');
  if(pwf) pwf.addEventListener('submit',async e=>{
    e.preventDefault(); const btn=pwf.querySelector('button[type="submit"]');
    const cur=pwf.querySelector('[name="current_password"],#current_password,#currentPassword')?.value;
    const nw=pwf.querySelector('[name="new_password"],#new_password,#newPassword')?.value;
    const conf=pwf.querySelector('[name="confirm_password"],#confirm_password,#confirmPassword')?.value;
    if(!cur||!nw){showToast('Fill all fields','error');return;}
    if(nw!==conf){showToast('Passwords do not match','error');return;}
    if(nw.length<8){showToast('Min 8 characters','error');return;}
    setBtnLoad(btn,true);
    try{await api.post('/auth/change-password',{current_password:cur,new_password:nw});showToast('Password changed!','success');pwf.reset();}
    catch(err){showToast(err.message||'Failed','error');}
    finally{setBtnLoad(btn,false,'Update Password');}
  });
  // Avatar
  const ai=document.getElementById('avatar-input')||(() => {const i=document.createElement('input');i.type='file';i.id='avatar-input';i.accept='image/*';i.style.display='none';document.body.appendChild(i);return i;})();
  document.querySelectorAll('[data-profile-avatar],[data-avatar-upload]').forEach(el=>{el.style.cursor='pointer';el.addEventListener('click',()=>ai.click());});
  ai.addEventListener('change',()=>{if(!ai.files[0])return;const url=URL.createObjectURL(ai.files[0]);document.querySelectorAll('[data-profile-avatar]').forEach(img=>{if(img.tagName==='IMG')img.src=url;});showToast('Save profile to apply avatar','info');});
}

const getVal=k=>document.querySelector(`[name="${k}"],#${k}`)?.value?.trim()||'';
const setVal=(k,v)=>{const el=document.querySelector(`[name="${k}"],#${k}`);if(el&&v!=null)el.value=v;};
const setText=(sel,txt)=>document.querySelectorAll(sel).forEach(el=>el.textContent=txt||'');
const setBtnLoad=(btn,on,label='Save Changes')=>{if(!btn)return;btn.disabled=on;btn.textContent=on?'Saving…':label;};
