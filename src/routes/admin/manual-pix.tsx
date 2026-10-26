import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, RefreshCw, Volume2, VolumeX, ShoppingBag, Clock, ShieldCheck, CreditCard } from "lucide-react";

export const Route = createFileRoute("/admin/manual-pix")({ component: ManualPixPage });
type ReviewHistory = {order_code: string; amount_cents: number; decision: string; reviewed_at: string; reviewer_id: string};
type Pending = { payment_id: string; order_id: string; order_code: string; customer_name: string; amount_cents: number; created_at: string };
const money=(c:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c/100);

/** Cash register inspired two-tone chime, generated locally. No remote audio file. */
function playRegister(ctx: AudioContext) {
 if(ctx.state !== "running") return;
 const start=ctx.currentTime+0.02;
 for(const [index,freq] of [988,1319,1760].entries()){
  const osc=ctx.createOscillator(), gain=ctx.createGain();
  const t=start+index*0.11;
  osc.type="sine";osc.frequency.setValueAtTime(freq,t);
  gain.gain.setValueAtTime(0.0001,t);
  gain.gain.exponentialRampToValueAtTime(0.19,t+0.009);
  gain.gain.exponentialRampToValueAtTime(0.0001,t+0.30);
  osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+0.32);
 }
}
function ManualPixPage() {
 const [rows,setRows]=useState<Pending[]>([]);
 const [history,setHistory]=useState<ReviewHistory[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState<string|null>(null);
 const [allowed,setAllowed]=useState(false);
 const [loading,setLoading]=useState(true);
 const [soundOn,setSoundOn]=useState(false);
 const [tab,setTab]=useState<"pending"|"settings"|"history">("pending");
 const seen=useRef<Set<string>|null>(null);
 const audio=useRef<AudioContext|null>(null);
 const fetching=useRef(false);
 const refresh=useCallback(async()=>{
  if(fetching.current)return;
  fetching.current=true;
  try{
   const {data:user}=await supabase.auth.getUser();
   if(!user.user){setAllowed(false);setRows([]);setError("Faça login como administrador.");return;}
   const {data,error:err}=await supabase.rpc("list_pending_manual_pix" as never);
   if(err){setAllowed(false);setRows([]);setError("Acesso negado ou migração pendente.");return;}
   const next=(data??[]) as Pending[];
   const ids=new Set(next.map(p=>p.payment_id));
   if(seen.current!==null && [...ids].some(id=>!seen.current?.has(id))){
    if(soundOn && audio.current) playRegister(audio.current);
   }
   seen.current=ids;
   setAllowed(true);setRows(next);setError("");
  } catch {setError("Falha de conexão. Tente atualizar novamente.");} finally {fetching.current=false;setLoading(false);}
 },[soundOn]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh()},5000);return()=>clearInterval(timer)},[refresh]);
 useEffect(()=>()=>{void audio.current?.close()},[]);
 async function toggleAudio(){
  if(soundOn){setSoundOn(false);return;}
  try{
   audio.current??=new AudioContext();
   await audio.current.resume();
   setSoundOn(true);
   playRegister(audio.current);
  }catch{setError("Ative som e permissões de áudio neste dispositivo.");}
 }
 async function loadHistory(){
  const {data,error:err}=await supabase.rpc("list_recent_manual_pix_reviews" as never);
  if(err){setError("Não foi possível obter o histórico de decisões.");return;}
  setHistory((data??[]) as ReviewHistory[]);setError("");
 }
 async function review(p:Pending,approve:boolean){
  if(!window.confirm(approve?"ATENÇÃO: confirme somente se o crédito exato foi identificado no EXTRATO NUBANK. Esta ação não verifica o banco.":"Rejeitar esta cobrança Pix pendente?"))return;
  setBusy(p.payment_id);
  try {
   const {error:err}=await supabase.rpc("review_manual_pix" as never,{p_payment_id:p.payment_id,p_approve:approve,p_note:"Conferência manual no Nubank"} as never);
   if(err)setError(err.message);
   else {await refresh();if(tab==="history")await loadHistory();}
  } catch {setError("Falha ao registrar decisão. Verifique o status antes de tentar novamente.");}
  finally {setBusy(null);}
 }
 const total=rows.reduce((n,p)=>n+p.amount_cents,0);
 const btn={border:"1px solid #384039",padding:"11px 14px",borderRadius:10,background:"#252b27",color:"#f4f7f2",cursor:"pointer"};
 return <main style={{minHeight:"100vh",background:"radial-gradient(circle at 10% 0%,#22311f,#0d100e 48%)",color:"#f6f8f5",fontFamily:"Inter,system-ui,sans-serif",padding:"max(20px,env(safe-area-inset-top)) 16px 36px"}}>
  <div style={{maxWidth:1000,margin:"0 auto"}}>
   <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:28}}>
    <div><div style={{color:"#c7ff65",fontSize:11,letterSpacing:3,fontWeight:800}}>AG · ABSOLUTO GLAMOUR</div><h1 style={{fontSize:"clamp(23px,4vw,35px)",margin:"8px 0 0"}}>Central Pix</h1></div>
    <button onClick={()=>void toggleAudio()} style={btn} aria-label={soundOn?"Desativar som":"Ativar som"}>{soundOn?<Volume2 size={21} color="#c7ff65"/>:<VolumeX size={21}/>}</button>
   </header>
   <p style={{color:"#9fae9f",lineHeight:1.6,marginBottom:23}}>Aprovação exclusivamente manual. Consulte os créditos no aplicativo Nubank antes de liberar qualquer pedido.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12,marginBottom:22}}>
    <div style={{background:"#1b221c",border:"1px solid #354336",padding:20,borderRadius:17}}>
     <Clock color="#c7ff65"/><div style={{fontSize:30,fontWeight:750,marginTop:12}}>{rows.length}</div><div style={{color:"#9ba99d",fontSize:13}}>Aguardando conferência</div>
    </div>
    <div style={{background:"#1b221c",border:"1px solid #354336",padding:20,borderRadius:17}}>
     <CreditCard color="#c7ff65"/><div style={{fontSize:"clamp(19px,3vw,30px)",fontWeight:750,marginTop:12}}>{money(total)}</div><div style={{color:"#9ba99d",fontSize:13}}>Valor pendente, não faturado</div>
    </div>
   </div>
   <nav style={{display:"flex",gap:8,marginBottom:19}} aria-label="Navegação">
    <button onClick={()=>setTab("pending")} style={{...btn,background:tab==="pending"?"#c7ff65":"#252b27",color:tab==="pending"?"#101510":"#eee"}}>Pedidos pendentes</button>
    <button onClick={()=>{setTab("history");void loadHistory()}} style={{...btn,background:tab==="history"?"#c7ff65":"#252b27",color:tab==="history"?"#101510":"#eee"}}>Histórico</button>
    <button onClick={()=>setTab("settings")} style={{...btn,background:tab==="settings"?"#c7ff65":"#252b27",color:tab==="settings"?"#101510":"#eee"}}>Alertas</button>
    <button onClick={()=>void refresh()} style={{...btn,marginLeft:"auto"}} aria-label="Atualizar"><RefreshCw size={18}/></button>
   </nav>
   {error&&<div role="alert" style={{border:"1px solid #e6a777",padding:12,borderRadius:12,color:"#ffca9b",marginBottom:14}}>{error}</div>}
   {tab==="history"?<section style={{background:"#1b221c",padding:18,borderRadius:16}}><h2>Decisões registradas</h2><p style={{fontSize:12,color:"#9fae9f"}}>Aprovação manual significa conferência realizada por um administrador, não validação via API bancária.</p>{history.length===0?<p>Nenhuma decisão disponível.</p>:history.map((h,i)=><div key={h.order_code+"-"+i} style={{padding:"14px 0",borderBottom:"1px solid #354036"}}><strong>{h.order_code}</strong> · {money(h.amount_cents)}<div style={{color:h.decision==="approved"?"#c7ff65":"#f6c78a",fontSize:13}}>{h.decision==="approved"?"Aprovado manualmente":"Rejeitado"} · {new Date(h.reviewed_at).toLocaleString("pt-BR")}</div></div>)}</section>:tab==="settings"?<section style={{background:"#1b221c",padding:22,borderRadius:16}}>
    <h2 style={{fontSize:19}}>Som de caixa registradora</h2>
    <p style={{lineHeight:1.6,color:"#b3beb4"}}>Ao detectar nova cobrança na fila, reproduz um toque de caixa registradora. Toque em “Ativar som” para liberar o áudio no Android. Funciona enquanto o aplicativo estiver aberto e conectado.</p>
    <button onClick={()=>void toggleAudio()} style={{...btn,background:"#c7ff65",color:"#101510"}}>{soundOn?"Desativar som":"Ativar som e testar toque"}</button>
    <p style={{fontSize:12,color:"#95a595"}}>Um Pix gerado não significa dinheiro recebido. Sem notificações em segundo plano nesta versão.</p>
   </section>:<>
    {loading?<p>Carregando pedidos com segurança...</p>:!allowed?<p>Entre com seu login administrativo para ver os pedidos.</p>:rows.length===0?<section style={{padding:34,textAlign:"center",background:"#1b221c",borderRadius:16}}><ShoppingBag size={38} color="#c7ff65"/><h2>Fila vazia</h2><p style={{color:"#9eab9e"}}>Novas cobranças aparecerão aqui.</p></section>:rows.map(p=><article key={p.payment_id} style={{background:"#1b221c",border:"1px solid #374437",borderRadius:17,padding:20,marginBottom:12}}>
     <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><strong>Pedido {p.order_code}</strong><span style={{fontSize:12,color:"#f6c78a"}}>● Aguardando Pix</span></div>
     <div style={{fontWeight:800,fontSize:28,margin:"15px 0 5px"}}>{money(p.amount_cents)}</div>
     <div style={{color:"#bac4b8",fontSize:14}}>{p.customer_name}</div>
     <div style={{color:"#8c9b8c",fontSize:12,margin:"9px 0 18px"}}>{new Date(p.created_at).toLocaleString("pt-BR")}</div>
     <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
      <button disabled={busy!==null} onClick={()=>void review(p,true)} style={{...btn,background:"#c7ff65",color:"#101510",fontWeight:700,display:"flex",justifyContent:"center",alignItems:"center",gap:5}}><Check size={17}/> Aprovar</button>
      <button disabled={busy!==null} onClick={()=>void review(p,false)} style={{...btn,display:"flex",justifyContent:"center",alignItems:"center",gap:5}}><X size={17}/> Rejeitar</button>
     </div>
    </article>)}
   </>}
   <footer style={{color:"#849386",fontSize:12,marginTop:28,display:"flex",alignItems:"center",gap:7}}><ShieldCheck size={16}/> Confirmação administrativa · não é verificação bancária</footer>
  </div>
 </main>;
}
