import { SankhyaError, type SankhyaGateway } from "./gateway.ts";
import type { CanonicalOrder } from "../../../src/lib/erp-submission-contract.ts";
const fail = (code: string, message: string, status = 409): never => {
  throw new SankhyaError(code, message, status);
};
/** O cadastro é revalidado antes de incluir e de confirmar, como na skill. */
export async function checkOrderRegistry(
  gateway: Pick<SankhyaGateway, "select">,
  p: Pick<
    CanonicalOrder,
    "codigo_parceiro" | "codigo_vendedor" | "codigo_condicao" | "tipo_agenda"
  >,
): Promise<void> {
  const rows = await gateway.select(
    `SELECT P.CODPARC,P.CODVEND,P.CLIENTE,P.ATIVO,P.AD_STATUS_PEDIDO,C.SUGTIPNEGSAID,T.CODTIPVENDA CONDICAO_VALIDADA,N.CODNAT,N.ATIVA,N.ANALITICA
FROM TGFPAR P LEFT JOIN TGFCPL C ON C.CODPARC=P.CODPARC
LEFT JOIN TGFTPV T ON T.CODTIPVENDA=C.SUGTIPNEGSAID AND T.DHALTER=(SELECT MAX(X.DHALTER) FROM TGFTPV X WHERE X.CODTIPVENDA=T.CODTIPVENDA AND X.DHALTER<=SYSDATE)
LEFT JOIN TGFNAT N ON N.CODNAT=10100000 WHERE P.CODPARC=${p.codigo_parceiro} AND ROWNUM<=2`,
    2,
  );
  const r = rows[0];
  if (
    rows.length !== 1 ||
    !r ||
    r["CLIENTE"] !== "S" ||
    r["ATIVO"] !== "S" ||
    Number(r["CODPARC"]) !== p.codigo_parceiro ||
    Number(r["CODNAT"]) !== 10100000 ||
    r["ATIVA"] !== "S" ||
    r["ANALITICA"] !== "S"
  )
    return fail(
      "ERP_ORDER_CONTEXT_CHANGED",
      "Condição, agenda ou natureza divergem do cadastro. Atualize a conferência; nenhum envio novo foi feito.",
    );
  if (Number(r["CODVEND"]) !== p.codigo_vendedor)
    return fail(
      "ERP_CUSTOMER_SELLER_MISMATCH",
      "O vendedor do pedido deve ser o vendedor cadastrado no cliente.",
      400,
    );
  if (
    Number(r["SUGTIPNEGSAID"]) !== p.codigo_condicao ||
    Number(r["CONDICAO_VALIDADA"]) !== p.codigo_condicao
  )
    return fail(
      "ERP_ORDER_PAYMENT_CHANGED",
      "A condição do pedido deve corresponder à Sugestão Saída cadastrada no cliente.",
    );
  if (String(r["AD_STATUS_PEDIDO"]) !== p.tipo_agenda)
    return fail(
      "ERP_ORDER_AGENDA_CHANGED",
      "A agenda do pedido deve corresponder à agenda cadastrada no cliente.",
    );
}
