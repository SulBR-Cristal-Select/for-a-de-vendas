import { SankhyaError } from './gateway.ts';
import { sellerProvisioningTargets } from './seller-provisioning-targets.ts';
type User = {id:string;email?:string;email_confirmed_at?:string|null;app_metadata?:Record<string,unknown>};
type Profile = {id:string;company_id:string;role:string;active:boolean};
type Attributes = {email:string;password:string;email_confirm:true;app_metadata:{sulbr_access_batch:string;sulbr_seller_code:number}};
type Deps = {users:()=>Promise<{users:User[];complete:boolean}|null>;profile:(id:string)=>Promise<Profile|null>;createUser:(attributes:Attributes)=>Promise<User|null>;now?:()=>number};
export const sellerAccessBatch='20261027-0827';
/** Coorte finita aprovada; cria somente Auth nativo, sem resetar contas existentes, ativar perfil ou conceder equipe. */
export async function provisionSellerAccess(d:Deps,actor:{id:string;role:string;company_id:string},value:unknown){
 if(actor.id!=='a46afcc5-14fd-4dd9-bd00-759e91b946ca'||actor.role!=='administrador'||actor.company_id!=='432299')throw new SankhyaError('FORBIDDEN','Provisionamento reservado ao administrador autorizado.',403);
 if((d.now?.()??Date.now())>=Date.parse('2026-10-27T13:00:00Z'))throw new SankhyaError('FORBIDDEN','Janela de provisionamento encerrada.',403);
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SankhyaError('INVALID_REQUEST','Provisionamento inválido.',400);
 const q=value as Record<string,unknown>;
 if(Object.keys(q).some(k=>!['code','password'].includes(k))||typeof q['code']!=='number'||!Number.isSafeInteger(q['code'])||typeof q['password']!=='string'||new TextEncoder().encode(q['password']).length<6||new TextEncoder().encode(q['password']).length>72)throw new SankhyaError('INVALID_REQUEST','Provisionamento inválido.',400);
 const target=sellerProvisioningTargets.find(x=>x.code===q['code']);if(!target)throw new SankhyaError('FORBIDDEN','Código fora da coorte aprovada.',403);
 const listed=await d.users();if(!listed?.complete)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Inventário Auth incompleto; nenhuma criação autorizada.',502);
 const matches=listed.users.filter(x=>x.email?.toLowerCase()===target.email);if(matches.length>1)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Identificador Auth ambíguo.',409);
 let user=matches[0];const created=!user;
 if(!user){const result=await d.createUser({email:target.email,password:q['password'],email_confirm:true,app_metadata:{sulbr_access_batch:sellerAccessBatch,sulbr_seller_code:target.code}});if(!result)throw new SankhyaError('ERP_CONTEXT_REQUIRED','Resultado Auth não confirmado; conferir o efeito antes de repetir.',502);user=result;}
 if(user.email?.toLowerCase()!==target.email||!user.email_confirmed_at||user.app_metadata?.['sulbr_access_batch']!==sellerAccessBatch||user.app_metadata?.['sulbr_seller_code']!==target.code)throw new SankhyaError('FORBIDDEN','Conta existente não corresponde ao provisionamento autorizado; nenhuma redefinição realizada.',403);
 const p=await d.profile(user.id);if(!p||p.id!==user.id||p.company_id!=='432299'||!['vendedor','gestor'].includes(p.role)||(p.active&&p.role!==target.role))throw new SankhyaError('ERP_CONTEXT_REQUIRED','Perfil Auth não corresponde à coorte; conferir antes de continuar.',409);
 return {ok:true,userId:user.id,email:target.email,sellerCode:target.code,role:target.role,created,authPrepared:true,emailConfirmationMethod:'admin-provisioning',passwordReset:false,profileActivated:false,scopeChanged:false,orderSent:false};
}
