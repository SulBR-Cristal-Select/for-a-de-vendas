import { makeCanonical, type Row } from '../lib/erp-submission-contract';
export const fixtureActorId='10000000-0000-4000-8000-000000000001';
export const fixtureOrderId='20000000-0000-4000-8000-000000000002';
export const fixtureRequestId='30000000-0000-4000-8000-000000000003';
export const fixtureFingerprint='a'.repeat(64);
export function submissionFixture(company:1|4=1):Row {
  return {id:fixtureOrderId,number:1,customerId:'sankhya:customer:141',sellerId:fixtureActorId,type:'Venda',status:'Orçamento',date:'2026-10-26',delivery:'2026-10-27',agenda:'1 - IMEDIATO',total:'11.75',clientOrder:'FIXTURE-SEM-ENV',freightType:null,receipt:null,
    erp:{source:'sankhya',mode:'online',companyCode:company,operationCode:1001,operationVersion:'2026-01-01T00:00:00',sellerCode:12,customer:{id:'sankhya:customer:141',partnerCode:141,name:'Cliente sintético'},payment:{code:29,version:'2026-01-01T00:00:00',label:'Condição sintética'}},
    items:[{productId:'sankhya:product:11240',qty:'1.00000',price:'11.750000000',total:'11.75',unit:'PC',erp:{source:'sankhya',mode:'online',companyCode:company,product:{productCode:11240,name:'Produto sintético'},localCode:108,control:' '}}]};
}
export function canonicalFixture(company:1|4=1){return makeCanonical(submissionFixture(company),{cnpj:'00000000000000',uf:'PR'},'C');}
