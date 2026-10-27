import{SankhyaError}from'./gateway.ts';
const operator='a46afcc5-14fd-4dd9-bd00-759e91b946ca';
const prepared:Record<string,{email:string;sellerCode:number}>={'82c846b0-17a1-4d1e-855d-3a1fdcb7226c':{email:'raul@sulbr.net.br',sellerCode:12},'7c85e6c0-768c-488b-8d7e-8fa5c65016b3':{email:'adilsoncrsouza@hotmail.com',sellerCode:34}};
type Profile={id:string;company_id:string;role:string;active:boolean};
type User={id:string;email?:string;email_confirmed_at?:string|null};
type Deps={profile:(id:string)=>Promise<Profile|null>;getUser:(id:string)=>Promise<User|null>;updateUser:(id:string,attributes:{password:string;email_confirm:true})=>Promise<User|null>;now?:()=>number};
/** Administração Auth nativa para os dois vínculos já preparados; não ativa perfil nem altera escopo. */
export async function prepareSellerAccess(d:Deps,actor:{id:string;role:string;company_id:string},value:unknown){
 if(actor.id!==operator||actor.role!=='administrador'||actor.company_id!=='432299')throw new SankhyaError('FORBIDDEN','Preparação reservada ao administrador autorizado.',403);
 if((d.now?.()??Date.now())>=Date.parse('2026-10-27T13:00:00Z'))throw new SankhyaError('FORBIDDEN','Janela de preparação encerrada.',403);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SankhyaError('INVALID_REQUEST','Preparação inválida.',400);const q=value as Record<string,unknown>;
 if(Object.keys(q).some(k=>!['userId','password'].includes(k))||typeof q['userId']!=='string'||!Object.hasOwn(prepared,q['userId'])||typeof q['password']!=='string'||new TextEncoder().encode(q['password']).length<6||new TextEncoder().encode(q['password']).length>72)throw new SankhyaError('INVALID_REQUEST','Preparação inválida.',400);
 const id=q['userId'],target=prepared[id]!,p=await d.profile(id),u=await d.getUser(id);
 if(!p||p.id!==id||p.company_id!=='432299'||!['vendedor','gestor'].includes(p.role)||!u||u.id!==id||u.email?.toLowerCase()!==target.email)throw new SankhyaError('FORBIDDEN','Conta não corresponde ao vínculo preparado.',403);
 const updated=await d.updateUser(id,{password:q['password'],email_confirm:true});
 if(!updated||updated.id!==id||updated.email?.toLowerCase()!==target.email||!updated.email_confirmed_at)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Preparação Auth não confirmada; conferir antes de repetir.',502);
 return{ok:true,userId:id,email:target.email,sellerCode:target.sellerCode,authPrepared:true,emailConfirmationMethod:'admin-provisioning',profileActivated:false,scopeChanged:false,orderSent:false};
}
