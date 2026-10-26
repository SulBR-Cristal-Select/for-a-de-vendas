import { describe, expect, it, vi } from 'vitest';
import { readCommercialDictionary } from '../../supabase/functions/sankhya-online/dictionary';

const admin = { role: 'administrador' as const };
const stockColumns = ['CODEMP','CODPROD','CODLOCAL','CONTROLE'].map(COLUMN_NAME => ({ COLUMN_NAME, DATA_TYPE: COLUMN_NAME === 'CONTROLE' ? 'VARCHAR2' : 'NUMBER' }));
const dictionaryColumns = [
  ...['NUCAMPO','NOMETAB','NOMECAMPO','DESCRCAMPO'].map(COLUMN_NAME => ({ TABLE_NAME: 'TDDCAM', COLUMN_NAME })),
  ...['NUCAMPO','VALOR','OPCAO'].map(COLUMN_NAME => ({ TABLE_NAME: 'TDDOPC', COLUMN_NAME })),
];
const physical = [
  ...Object.entries({ CODEMP:'NUMBER', CODTIPOPER:'NUMBER', CODNAT:'NUMBER', NUNOTA:'NUMBER', DHTIPOPER:'DATE', DTNEG:'DATE', TIPMOV:'CHAR', STATUSNOTA:'VARCHAR2' }).map(([COLUMN_NAME,DATA_TYPE]) => ({ TABLE_NAME:'TGFCAB', COLUMN_NAME, DATA_TYPE })),
  ...Object.entries({ CODTIPOPER:'NUMBER', DHALTER:'DATE', GOLSINAL:'NUMBER', GOLDEV:'NUMBER', DESCROPER:'VARCHAR2' }).map(([COLUMN_NAME,DATA_TYPE]) => ({ TABLE_NAME:'TGFTOP', COLUMN_NAME, DATA_TYPE })),
];
const operations = { kind:'analytics', section:'operations', companyCode:4, from:'2026-10-01', to:'2026-10-24' };

describe('Diagnóstico comercial fixo e somente leitura', () => {
  it.each(['gestor','vendedor'] as const)('não permite diagnóstico administrativo para %s, mesmo com vínculo', async role => {
    const g={select:vi.fn()};
    await expect(readCommercialDictionary(g,{kind:'stock-context',companyCode:4,productCode:11240},{role,sellerCode:34,companyCodes:[1,4]})).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each([
    {kind:'stock-context',companyCode:3,productCode:11240},
    {kind:'stock-context',companyCode:4,productCode:0},
    {kind:'stock-context',companyCode:4,productCode:11240,sellerCode:5},
    {kind:'stock-context',companyCode:4,productCode:11240,sql:'SELECT 1'},
    {kind:'stock-overview',companyCode:3},
    {kind:'stock-overview',companyCode:4,sql:'SELECT 1'},
    {...operations,standardSales:'true'},
    {kind:['payments']},
    {kind:'analytics',section:'metadata',after:"TGFPAR.X' OR 1=1"},
    {kind:'analytics',section:'metadata',table:'TSIUSU'},
    {kind:'analytics',section:'options',fieldId:-1},
    {...operations,from:'2026-02-30'},
    {...operations,to:'2026-09-30'},
    {...operations,from:'2024-01-01'},
    {...operations,offset:0.5},
  ])('recusa parâmetros fora do contrato antes de consultar: %j', async input => {
    const g={select:vi.fn()};
    await expect(readCommercialDictionary(g,input,admin)).rejects.toBeDefined();
    expect(g.select).not.toHaveBeenCalled();
  });
  it.each([
    {rows:[],cardinality:'absent',hasMore:false},
    {rows:[{CODLOCAL:0,CONTROLE:' '}],cardinality:'single',hasMore:false},
    {rows:[{CODLOCAL:0,CONTROLE:' '},{CODLOCAL:1,CONTROLE:'LOTE'}],cardinality:'multiple',hasMore:true},
  ])('distingue $cardinality sem escolher variante nem consultar preço', async ({rows,cardinality,hasMore}) => {
    const g={select:vi.fn().mockResolvedValueOnce(stockColumns).mockResolvedValueOnce(rows)};
    const result=await readCommercialDictionary(g,{kind:'stock-context',companyCode:4,productCode:11240},admin);
    expect(result).toMatchObject({cardinality,hasMore,variants:rows,priceQueried:false,companyCode:4,productCode:11240});
    expect(g.select.mock.calls[1]?.[0]).toContain('WHERE CODEMP=4 AND CODPROD=11240');
    expect(g.select.mock.calls[1]?.[1]).toBe(2);
    expect(g.select.mock.calls.some(([sql])=>/PRECO|VLRVENDA|TGFEXC|TGFTAB|ESTOQUE|RESERVADO/.test(sql))).toBe(false);
  });
  it('não consulta variantes quando a estrutura física não confere', async () => {
    const g={select:vi.fn().mockResolvedValueOnce(stockColumns.filter(row=>row.COLUMN_NAME!=='CONTROLE'))};
    await expect(readCommercialDictionary(g,{kind:'stock-context',companyCode:4,productCode:11240},admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
    expect(g.select).toHaveBeenCalledTimes(1);
  });
  it('pagina somente metadados da lista fixa e exclui TSIUSU', async () => {
    const fields=Array.from({length:50},(_,i)=>({TABLE_NAME:'TGFCAB',COLUMN_NAME:`CAMPO_${i}`,DATA_TYPE:'NUMBER'}));
    const g={select:vi.fn().mockResolvedValue(fields)};
    expect(await readCommercialDictionary(g,{kind:'analytics',section:'metadata',after:'TGFCAB.CODNAT'},admin)).toMatchObject({next:'TGFCAB.CAMPO_49',hasMore:true});
    expect(g.select.mock.calls[0]?.[0]).toContain("D.TABLE_NAME||'.'||D.COLUMN_NAME>'TGFCAB.CODNAT'");
    expect(g.select.mock.calls[0]?.[0]).not.toMatch(/TSIUSU|INTERNO/);
    expect(g.select.mock.calls[0]?.[1]).toBe(50);
  });
  it('lê a descrição comprovada do campo sem atribuir significado ao código', async () => {
    const fields=[{TABLE_NAME:'TGFTOP',FIELD_NAME:'GOLSINAL',DESCRIPTION:'Descrição sintética',NUCAMPO:99}];
    const g={select:vi.fn().mockResolvedValueOnce(dictionaryColumns).mockResolvedValueOnce(fields)};
    expect(await readCommercialDictionary(g,{kind:'analytics',section:'definitions'},admin)).toMatchObject({fields,hasMore:false});
    expect(g.select.mock.calls[1]?.[0]).toContain('JOIN USER_TAB_COLUMNS D');
    expect(g.select.mock.calls[1]?.[1]).toBe(50);
  });
  it('pagina opções pelo campo permitido, sem ler o valor cadastrado de usuários', async () => {
    const options=[{TABLE_NAME:'TGFTOP',FIELD_NAME:'GOLSINAL',CODE_VALUE:'X',DESCRIPTION:'Opção sintética'}];
    const g={select:vi.fn().mockResolvedValueOnce(dictionaryColumns).mockResolvedValueOnce(options)};
    expect(await readCommercialDictionary(g,{kind:'analytics',section:'options',fieldId:99,offset:50},admin)).toMatchObject({options,fieldId:99,offset:50,hasMore:false});
    const sql=g.select.mock.calls[1]?.[0];
    expect(sql).toContain('C.NUCAMPO=99');expect(sql).toContain('OFFSET 50 ROWS FETCH NEXT 50 ROWS ONLY');expect(sql).not.toMatch(/TSIUSU|INTERNO/);
  });
  it('agrupa no ERP por empresa, período, situação, TOP e versão histórica exata', async () => {
    const rows=[{CODEMP:4,TIPMOV:'V',CODTIPOPER:1200,CODNAT:9,DOCUMENT_COUNT:3,TOP_GOLSINAL:0}];
    const g={select:vi.fn().mockResolvedValueOnce(physical).mockResolvedValueOnce(rows)};
    const result=await readCommercialDictionary(g,{...operations,offset:50},admin);
    expect(result).toMatchObject({rows,companyCode:4,dateField:'DTNEG',rulesInferred:false,offset:50});
    const sql=g.select.mock.calls[1]?.[0];
    expect(sql).toContain('T.DHALTER=H.DHTIPOPER');expect(sql).toContain('H.CODEMP=4');expect(sql).toContain("H.TIPMOV IN ('P','V')");
    expect(sql).toContain("H.DTNEG>=TO_DATE('2026-10-01','YYYY-MM-DD')");expect(sql).toContain("H.DTNEG<TO_DATE('2026-10-24','YYYY-MM-DD')+1");
    expect(sql).toContain('COUNT(*) AS DOCUMENT_COUNT');expect(sql).toContain('T.GOLSINAL AS TOP_GOLSINAL');expect(sql).not.toMatch(/VLRNOTA|NOMEPARC|CGC_CPF/);
    expect(sql).toContain('OFFSET 50 ROWS FETCH NEXT 50 ROWS ONLY');expect(g.select.mock.calls.every(([,limit])=>limit<=50)).toBe(true);
  });
  it('não usa campos opcionais ausentes nem substitui versão histórica pela última', async () => {
    const g={select:vi.fn().mockResolvedValueOnce(physical.filter(row=>row.TABLE_NAME!=='TGFTOP'||['CODTIPOPER','DHALTER'].includes(row.COLUMN_NAME))).mockResolvedValueOnce([])};
    expect(await readCommercialDictionary(g,operations,admin)).toMatchObject({observedTopFields:[],rows:[],hasMore:false});
    const sql=g.select.mock.calls[1]?.[0];expect(sql).not.toContain('GOLSINAL');expect(sql).not.toContain('MAX(T.');
  });
  it.each(['gestor','vendedor'] as const)('não libera cobertura de estoque para %s', async role => {
    const g={select:vi.fn()};
    await expect(readCommercialDictionary(g,{kind:'stock-overview',companyCode:4},{role,sellerCode:34,companyCodes:[1,4]})).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});
    expect(g.select).not.toHaveBeenCalled();
  });
  it('comprova ausência de registros de estoque por agregado sem afirmar saldo zero', async () => {
    const g={select:vi.fn().mockResolvedValueOnce(stockColumns.filter(r=>['CODEMP','CODPROD'].includes(r.COLUMN_NAME))).mockResolvedValueOnce([{CONTEXT_ROWS:0,PRODUCT_COUNT:'0'}])};
    expect(await readCommercialDictionary(g,{kind:'stock-overview',companyCode:4},admin)).toMatchObject({contextRows:0,productCount:0,productSample:[],hasMore:false,variantSelected:false,balanceQueried:false,priceQueried:false});
    expect(g.select).toHaveBeenCalledTimes(2);expect(g.select.mock.calls[1]?.[0]).toContain('FROM TGFEST WHERE CODEMP=4');
    expect(g.select.mock.calls.some(([sql])=>/ESTOQUE|RESERVADO|PRECO|TGFEXC/.test(sql))).toBe(false);
  });
  it('traz apenas dois códigos observados, sem eleger local ou controle', async () => {
    const g={select:vi.fn().mockResolvedValueOnce(stockColumns.filter(r=>['CODEMP','CODPROD'].includes(r.COLUMN_NAME))).mockResolvedValueOnce([{CONTEXT_ROWS:12,PRODUCT_COUNT:4}]).mockResolvedValueOnce([{CODPROD:11},{CODPROD:'12'}])};
    expect(await readCommercialDictionary(g,{kind:'stock-overview',companyCode:4},admin)).toMatchObject({productSample:[11,12],hasMore:true,variantSelected:false});
    expect(g.select.mock.calls[2]?.[0]).toContain('FETCH FIRST 2 ROWS ONLY');expect(g.select.mock.calls[2]?.[1]).toBe(2);
  });
  it.each([
    {CONTEXT_ROWS:null,PRODUCT_COUNT:0},
    {CONTEXT_ROWS:3,PRODUCT_COUNT:4},
    {CONTEXT_ROWS:3,PRODUCT_COUNT:0},
  ])('não transforma contagem ausente ou incoerente em zero: %j', async totals => {
    const g={select:vi.fn().mockResolvedValueOnce(stockColumns.filter(r=>['CODEMP','CODPROD'].includes(r.COLUMN_NAME))).mockResolvedValueOnce([totals])};
    await expect(readCommercialDictionary(g,{kind:'stock-overview',companyCode:4},admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
    expect(g.select).toHaveBeenCalledTimes(2);
  });
  it('recusa amostra que mudou entre contagem e leitura', async () => {
    const g={select:vi.fn().mockResolvedValueOnce(stockColumns.filter(r=>['CODEMP','CODPROD'].includes(r.COLUMN_NAME))).mockResolvedValueOnce([{CONTEXT_ROWS:3,PRODUCT_COUNT:2}]).mockResolvedValueOnce([{CODPROD:11}])};
    await expect(readCommercialDictionary(g,{kind:'stock-overview',companyCode:4},admin)).rejects.toMatchObject({code:'ERP_INVALID_RESPONSE'});
  });
  it('aplica a venda padrão confirmada com versão exata e sem usar GOLSINAL de P como classificador', async () => {
    const columns=[...physical,{TABLE_NAME:'TGFTOP',COLUMN_NAME:'BONIFICACAO',DATA_TYPE:'VARCHAR2'},{TABLE_NAME:'TGFTOP',COLUMN_NAME:'TIPMOV',DATA_TYPE:'VARCHAR2'}];
    const g={select:vi.fn().mockResolvedValueOnce(columns).mockResolvedValueOnce([{MISSING_CONTEXT_COUNT:0}]).mockResolvedValueOnce([])};
    expect(await readCommercialDictionary(g,{...operations,standardSales:true},admin)).toMatchObject({salesPolicy:{movement:'P',operationCode:1001,natureCode:10100000,statusCode:'L'},rows:[],rulesInferred:false});
    const sql=g.select.mock.calls[2]?.[0];
    for(const clause of ["H.TIPMOV='P'",'H.CODTIPOPER=1001','H.CODNAT=10100000',"H.STATUSNOTA='L'","T.BONIFICACAO='N'",'T.GOLDEV=1','T.DHALTER=H.DHTIPOPER']) expect(sql).toContain(clause);
    expect(sql).not.toMatch(/T\.GOLSINAL\s*=/);expect(g.select.mock.calls.every(([,limit])=>limit<=50)).toBe(true);
    expect(g.select.mock.calls[1]?.[0]).toContain("T.BONIFICACAO NOT IN ('N','S')");
    expect(g.select.mock.calls[1]?.[0]).toContain('T.GOLDEV NOT IN (-1,1)');
  });
  it('não retorna zero quando falta o contexto histórico da venda padrão', async () => {
    const columns=[...physical,{TABLE_NAME:'TGFTOP',COLUMN_NAME:'BONIFICACAO',DATA_TYPE:'VARCHAR2'},{TABLE_NAME:'TGFTOP',COLUMN_NAME:'TIPMOV',DATA_TYPE:'VARCHAR2'}];
    const g={select:vi.fn().mockResolvedValueOnce(columns).mockResolvedValueOnce([{MISSING_CONTEXT_COUNT:1}])};
    await expect(readCommercialDictionary(g,{...operations,standardSales:true},admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
    expect(g.select).toHaveBeenCalledTimes(2);
  });
  it('recusa venda padrão sem metadados de bonificação e preserva a consulta bruta quando false', async () => {
    const g={select:vi.fn().mockResolvedValue(physical)};
    await expect(readCommercialDictionary(g,{...operations,standardSales:true},admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
    expect(g.select).toHaveBeenCalledTimes(1);
    const raw={select:vi.fn().mockResolvedValueOnce(physical).mockResolvedValueOnce([])};
    expect(await readCommercialDictionary(raw,{...operations,standardSales:false},admin)).not.toHaveProperty('salesPolicy');
    expect(raw.select.mock.calls[1]?.[0]).toContain("H.TIPMOV IN ('P','V')");
  });
  it('falha fechado se a data ou chave necessária não tem tipo confirmado', async () => {
    const g={select:vi.fn().mockResolvedValueOnce(physical.map(row=>row.COLUMN_NAME==='DTNEG'?{...row,DATA_TYPE:'VARCHAR2'}:row))};
    await expect(readCommercialDictionary(g,operations,admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});
    expect(g.select).toHaveBeenCalledTimes(1);
  });
});

describe('fontes restantes: qualificação nativa restrita, sem valores comerciais',()=>{
 it('consulta somente estrutura e descrições das fontes fixas',async()=>{const fields=[{TABLE_NAME:'TGFEST',COLUMN_NAME:'ESTOQUE',DATA_TYPE:'NUMBER',DESCRIPTION:'Estoque',FIELD_ID:1}];const g={select:vi.fn().mockResolvedValueOnce(dictionaryColumns).mockResolvedValueOnce(fields)};expect(await readCommercialDictionary(g,{kind:'analytics',section:'pending-sources'},admin)).toMatchObject({fields,hasMore:false,valuesQueried:false,rulesInferred:false});const sql=g.select.mock.calls[1]?.[0];expect(sql).toContain('FROM USER_TAB_COLUMNS D LEFT JOIN TDDCAM C');expect(sql).toContain("'TGFFIN','TGFCOM','TGFCMF','TGFEST'");expect(sql).not.toMatch(/TSIUSU|INTERNO|SELECT \*|FROM TGFFIN|FROM TGFEST/);expect(g.select.mock.calls.every(([,limit])=>limit<=50)).toBe(true);});
 it('pagina por cursor técnico, sem tabela ou SQL fornecidos pelo navegador',async()=>{const fields=Array.from({length:50},(_,n)=>({TABLE_NAME:'TGFFIN',COLUMN_NAME:'CAMPO'+n}));const g={select:vi.fn().mockResolvedValueOnce(dictionaryColumns).mockResolvedValueOnce(fields)};expect(await readCommercialDictionary(g,{kind:'analytics',section:'pending-sources',after:'TGFCOM.CODVEND'},admin)).toMatchObject({next:'TGFFIN.CAMPO49',hasMore:true});expect(g.select.mock.calls[1]?.[0]).toContain("D.TABLE_NAME||'.'||D.COLUMN_NAME>'TGFCOM.CODVEND'");});
 it.each([{sql:'SELECT 1'},{table:'TSIUSU'},{after:"X' OR 1=1"}])('recusa desvio: %j',async patch=>{const g={select:vi.fn()};await expect(readCommercialDictionary(g,{kind:'analytics',section:'pending-sources',...patch},admin)).rejects.toBeDefined();expect(g.select).not.toHaveBeenCalled();});
 it('ausência da estrutura do dicionário não vira fonte vazia ou regra confirmada',async()=>{const g={select:vi.fn().mockResolvedValue([])};await expect(readCommercialDictionary(g,{kind:'analytics',section:'pending-sources'},admin)).rejects.toMatchObject({code:'ERP_CONTEXT_REQUIRED'});});
});

describe('descoberta aprofundada ABC/comissão pela API, sem referência de tela',()=>{
 it.each(['abc','abc-keys','commission-schema','commission-options','commission-totals','commission-origin-totals','item-commission-totals'])('consulta fixa paginada para %s',async target=>{const g={select:vi.fn().mockResolvedValueOnce(dictionaryColumns).mockResolvedValueOnce([])};expect(await readCommercialDictionary(g,{kind:'analytics',section:'native-source-discovery',target,offset:50},admin)).toMatchObject({target,offset:50,rows:[],hasMore:false,rulesInferred:false,amountsCalculated:false});const sql=g.select.mock.calls[1]?.[0];expect(sql).toContain('OFFSET 50 ROWS FETCH NEXT 50 ROWS ONLY');expect(sql).not.toMatch(/SELECT \*|ESTOQUE\s*-|\bUPDATE\b|\bINSERT\b|INTERNO/);if(target.includes('totals'))expect(sql).toMatch(/CODEMP IN \(1,4\)/);if(target==='abc')expect(sql).toContain("C.NOMETAB<>'TSIUSU'");});
 it.each([{target:'arbitrary'},{target:'abc',sql:'SELECT 1'},{target:'abc',offset:-1},{target:'abc',table:'TSIUSU'}])('não permite consulta livre: %j',async patch=>{const g={select:vi.fn()};await expect(readCommercialDictionary(g,{kind:'analytics',section:'native-source-discovery',...patch},admin)).rejects.toBeDefined();expect(g.select).not.toHaveBeenCalled();});
 it('mantém a descoberta administrativa sem elevar vendedor/gestor',async()=>{const g={select:vi.fn()};await expect(readCommercialDictionary(g,{kind:'analytics',section:'native-source-discovery',target:'abc'},{role:'vendedor',sellerCode:12,companyCodes:[1]})).rejects.toMatchObject({code:'ERP_IDENTITY_REQUIRED'});expect(g.select).not.toHaveBeenCalled();});
});
