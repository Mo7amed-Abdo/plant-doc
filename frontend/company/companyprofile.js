// companyprofile.js
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth('company')) return;
  populateSidebarUser(); setupLogout();
  await loadProfile();
  setupForms();
});

async function loadProfile() {
  try {
    const p=(await api.get('/company/profile')).data;
    setVal('company-name',p.company_name); setVal('full_name',p.full_name);
    setVal('contact-number',p.phone||''); setVal('phone',p.phone||'');
    setVal('email',p.email||''); setVal('street-address',p.company_address||'');
    setVal('description',p.description||'');
    setText('[data-profile-name]',p.company_name||p.full_name);
    setText('[data-profile-role]','Company');
    setText('[data-profile-email]',p.email||'');
    const inits=(p.company_name||p.full_name||'C').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    setText('[data-profile-initials]',inits);
    if(p.logo){document.querySelectorAll('[data-profile-avatar],[data-profile-logo]').forEach(img=>{if(img.tagName==='IMG')img.src=p.logo;});}
  }catch(e){showToast('Failed to load profile','error');}
}

function setupForms() {
  // Company details form
  const allForms=document.querySelectorAll('form, [data-form]');
  allForms.forEach(form=>{
    const saveBtn=form.querySelector('button[type="submit"],.save-btn,button:not([type="button"])');
    if(!saveBtn) return;
    form.addEventListener('submit',async e=>{
      e.preventDefault(); setBtnLoad(saveBtn,true);
      try{
        const fd=new FormData();
        const fields={'company-name':'company_name','full_name':'full_name','contact-number':'company_phone',phone:'phone','email':'company_email','street-address':'company_address','description':'description'};
        Object.entries(fields).forEach(([id,key])=>{const v=getVal(id)||getVal(key);if(v)fd.append(key,v);});
        const li=document.getElementById('logo-input');if(li?.files[0])fd.append('logo',li.files[0]);
        await api.put('/company/profile',fd);
        showToast('Profile updated!','success');
        const res=await api.get('/company/profile'); Auth.setSession({token:Auth.getToken(),user:res.data}); populateSidebarUser();
      }catch(err){showToast(err.message||'Update failed','error');}
      finally{setBtnLoad(saveBtn,false,'Save Details');}
    });
  });
  // Password
  const pwf=document.getElementById('password-form')||document.querySelector('[data-form="security"]');
  if(pwf) pwf.addEventListener('submit',async e=>{
    e.preventDefault(); const btn=pwf.querySelector('button[type="submit"]');
    const cur=pwf.querySelector('[name="current_password"],#currentPassword,#current-password')?.value;
    const nw=pwf.querySelector('[name="new_password"],#newPassword,#new-password')?.value;
    const conf=pwf.querySelector('[name="confirm_password"],#confirmPassword,#confirm-password')?.value;
    if(!cur||!nw){showToast('Fill all fields','error');return;}
    if(nw!==conf){showToast('Passwords do not match','error');return;}
    if(nw.length<8){showToast('Min 8 characters','error');return;}
    setBtnLoad(btn,true);
    try{await api.post('/auth/change-password',{current_password:cur,new_password:nw});showToast('Password changed!','success');pwf.reset();}
    catch(err){showToast(err.message||'Failed','error');}
    finally{setBtnLoad(btn,false,'Update Password');}
  });
  // Logo upload
  const li=document.getElementById('logo-input')||(() => {const i=document.createElement('input');i.type='file';i.id='logo-input';i.accept='image/*';i.style.display='none';document.body.appendChild(i);return i;})();
  document.querySelectorAll('[data-profile-avatar],[data-profile-logo],[data-avatar-upload]').forEach(el=>{el.style.cursor='pointer';el.addEventListener('click',()=>li.click());});
  li.addEventListener('change',()=>{if(!li.files[0])return;const url=URL.createObjectURL(li.files[0]);document.querySelectorAll('[data-profile-avatar],[data-profile-logo]').forEach(img=>{if(img.tagName==='IMG')img.src=url;});showToast('Save profile to apply logo','info');});
}

const getVal=k=>(document.getElementById(k)||document.querySelector(`[name="${k}"]`))?.value?.trim()||'';
const setVal=(k,v)=>{const el=document.getElementById(k)||document.querySelector(`[name="${k}"]`);if(el&&v!=null)el.value=v;};
const setText=(sel,txt)=>document.querySelectorAll(sel).forEach(el=>el.textContent=txt||'');
const setBtnLoad=(btn,on,label='Save')=>{if(!btn)return;btn.disabled=on;btn.textContent=on?'Saving…':label;};
