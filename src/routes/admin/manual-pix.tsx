import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/manual-pix")({ component: ManualPixPage });

type Pending = { payment_id: string; order_id: string; order_code: string; customer_name: string; amount_cents: number; created_at: string };
function ManualPixPage() {
 const [rows,setRows]=useState<Pending[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState<string|null>(null);
 const [allowed,setAllowed]=useState(false);
 async function refresh() {
   const { data: user } = await supabase.auth.getUser();
   if (!user.user) { setAllowed(false); setRows([]); setError("Faça login como administrador da loja."); return; }
   const { data, error: err } = await supabase.rpc("list_pending_manual_pix" as never);
   if (err) { setAllowed(false); setError("Acesso negado ou banco ainda não preparado."); return; }
   setAllowed(true); setRows((data ?? []) as Pending[]); setError("");
 }
 useEffect(()=> {void refresh(); const timer=setInterval(()=>{if(document.visibilityState==="visible") void refresh()},15000);return ()=>clearInterval(timer)},[]);
 async function review(p:Pending,approve:boolean) {
   if(!window.confirm(approve
    ? "Você conferiu o EXTRATO DO NUBANK e identificou o crédito correto? A aprovação é manual e NÃO é validação bancária."
    : "Rejeitar esta tentativa de pagamento?")) return;
   setBusy(p.payment_id);
   const {error:err}=await supabase.rpc("review_manual_pix" as never,
     {p_payment_id:p.payment_id,p_approve:approve,p_note:"Revisão manual no painel"} as never);
   if(err) setError(err.message);
   else await refresh();
   setBusy(null);
 }
 return <main style={{maxWidth:850,margin:"auto",padding:24,fontFamily:"sans-serif",background:"#111",color:"#fff",minHeight:"100vh"}}>
 <h1 style={{color:"#b9f75c"}}>Absoluto Glamour · Pix manual</h1>
 <p>Pedidos aguardando sua conferência. Só aprove após verificar o dinheiro recebido no aplicativo Nubank.</p>
 <p style={{color:"#ffc97a"}}>Esta tela NÃO consulta seu banco e não confirma pagamentos automaticamente.</p>
 {error && <p role="alert">{error}</p>}
 <button onClick={()=>void refresh()}>Atualizar pedidos</button>
 {allowed && rows.length===0 && <p>Nenhum Pix manual pendente.</p>}
 {allowed && rows.map(p=><section key={p.payment_id} style={{border:"1px solid #555",padding:16,marginTop:12}}>
 <strong>Pedido {p.order_code}</strong><p>{p.customer_name} · R$ {(p.amount_cents/100).toFixed(2).replace(".",",")}</p>
 <small>Solicitado em {new Date(p.created_at).toLocaleString("pt-BR")}</small>
 <div style={{display:"flex",gap:12,marginTop:12}}>
 <button disabled={busy!==null} onClick={()=>void review(p,true)} style={{background:"#b9f75c",color:"#111",padding:12}}>Aprovar manualmente</button>
 <button disabled={busy!==null} onClick={()=>void review(p,false)} style={{padding:12}}>Rejeitar</button>
 </div></section>)}
 </main>;
}
