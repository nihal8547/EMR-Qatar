'use strict';
/* Administration + auth schemas */
module.exports = (R, Alias) => {
  R('branches', 'admin', 'Branches', [
    'name:text::req,list,search',
    'code:text::req,list,uniq',
    'phone:phone::list',
    'address:text',
    'active:bool:Active:list,def=true',
  ]);

  R('departments', 'admin', 'Departments', [
    'name:text::req,list,search',
    'code:text::list,uniq',
    'type:select=Clinical/Diagnostic/Support/Administrative:Type:list,filter',
    'active:bool:Active:list,def=true',
  ]);

  R('specialities', 'admin', 'Specialities', [
    'name:text::req,list,search,uniq',
    'name_ar:text:Name (Arabic)',
  ]);

  R('nationalities', 'admin', 'Nationalities', [
    'name:text::req,list,search,uniq',
    'name_ar:text:Name (Arabic)',
    'iso_code:text:ISO code:list',
  ]);

  R('templates', 'admin', 'Print & Message Templates', [
    'name:text::req,list,search',
    'type:select=Print/SMS/WhatsApp/Email/Consent form:Type:req,list,filter',
    'language:select=English/Arabic/Malayalam/Hindi/Urdu/Tagalog:Language:list',
    'subject:text',
    'body:textarea:Body:req',
    'active:bool:Active:list,def=true',
  ], { help: 'Use {{patient_name}}, {{date}}, {{time}}, {{doctor}}, {{amount}} as placeholders.' });

  R('integration_settings', 'admin', 'Integration Settings', [
    'name:text::req,list,search',
    'type:select=Insurer/QHIE-Hub/QPTTS/Lab analyzer/PACS/WhatsApp/SMS/Payment gateway/Email:Type:req,list,filter',
    'endpoint:text:Endpoint URL:list',
    'mode:select=Simulated/Live:Mode:req,list,def=Simulated',
    'active:bool:Active:list,def=true',
    'notes:textarea',
  ], { help: 'Credentials/secrets are never stored here. Keep them in server environment variables. In Simulated mode, claim submission is logged but nothing is sent to a real insurer.' });

  R('integration_logs', 'admin', 'Integration Logs', [
    'integration:text::list,search',
    'direction:select=Outbound/Inbound:Direction:list',
    'reference:text::list,search',
    'status:text::list',
    'message:textarea',
  ], { readonly: true });

  R('audit_log', 'admin', 'Audit Log', [
    'username:text::list,search',
    'action:text::list,filter',
    'resource:text::list,search',
    'record_id:text:Record::list',
    'ip:text:IP address',
    'details:json:Details',
  ], { readonly: true, orderBy: '"id" DESC' });

  R('settings', 'admin', 'System Settings', [
    'key:text:Setting key:req,list,uniq,search',
    'value:text:Value:req,list',
    'description:text:Description:list',
  ]);

  /* ---- auth schema ---- */
  R('roles', 'admin', 'Roles', [
    'name:text::req,list,uniq,search',
    'description:text::list',
    'restrict_to_own_visits:bool:Restrict to own patients (break-glass needed):list,def=false',
    'discount_limit_pct:decimal:Discount limit %:list,def=0',
  ], { schema: 'auth', help: 'Set what each role can do in "Role & Permission Matrix".' });

  R('users', 'admin', 'Users', [
    'username:text::req,list,search,uniq',
    'full_name:text::req,list,search',
    'email:email::list',
    'phone:phone',
    'role_id:ref=roles:Role:req,list,filter',
    'password:password:Password (leave blank to keep)',
    'password_hash:text::hide,secret',
    'speciality_id:ref=specialities:Speciality',
    'department_id:ref=departments:Department',
    'licence_no:text:DHP licence no',
    'licence_expiry:date:Licence expiry:list',
    'patient_id:ref=patients:Linked patient (portal users only)',
    'active:bool:Active:list,def=true',
    'last_login:datetime::ro,list',
  ], { schema: 'auth', disp: ['full_name'], hooks: { before: 'userBefore' } });

  Alias('doctors', 'users', `"role_id" IN (SELECT id FROM "auth"."roles" WHERE name = 'Doctor')`, 'Doctors');
};
