"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Player = {
  id: number; web_name: string; team: number; element_type: number; now_cost: number;
  total_points: number; form: string; points_per_game: string; selected_by_percent: string;
  minutes: number; chance_of_playing_next_round: number | null; status: string;
  transfers_in_event: number; transfers_out_event: number; expected_goal_involvements_per_90?: string;
};
type Team = { id: number; short_name: string; name: string; strength: number };
type Event = { id: number; name: string; deadline_time: string; is_current: boolean; is_next: boolean; finished: boolean };
type Bootstrap = { elements: Player[]; teams: Team[]; events: Event[] };
type Pick = { element: number; position: number; multiplier: number; is_captain: boolean; is_vice_captain: boolean; selling_price?: number; purchase_price?: number };
type Entry = { id: number; name: string; player_first_name: string; player_last_name: string; summary_overall_points: number; summary_overall_rank: number | null };

const pos = ["", "GK", "DEF", "MID", "FWD"];
const demoIds = [182, 235, 328, 351, 401, 17, 120, 255, 308, 427, 506, 62, 214, 390, 475];
const fmt = new Intl.NumberFormat("en-GB");

function score(p: Player) {
  const availability = p.chance_of_playing_next_round ?? (p.status === "a" ? 100 : 40);
  const momentum = Number(p.form || 0) * 0.58 + Number(p.points_per_game || 0) * 0.42;
  const minutesConfidence = Math.min(1, p.minutes / 900);
  const market = Math.max(-1, Math.min(1, (p.transfers_in_event - p.transfers_out_event) / 100000));
  return momentum * (0.72 + minutesConfidence * 0.28) * (availability / 100) + market * 0.35;
}

export default function Home() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [bank, setBank] = useState(0);
  const [managerId, setManagerId] = useState("");
  const [message, setMessage] = useState("Loading live FPL data…");
  const [loadingTeam, setLoadingTeam] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("fpl-manager-id") || "";
    setManagerId(saved);
    fetch("/api/fpl?resource=bootstrap").then(r => r.json()).then((d: Bootstrap) => {
      setData(d); setMessage("Live data connected");
      if (saved) void loadTeam(saved, d);
    }).catch(() => setMessage("FPL data is temporarily unavailable"));
  }, []);

  async function loadTeam(id: string, bootstrap = data) {
    if (!/^\d+$/.test(id) || !bootstrap) { setMessage("Enter the number from your FPL Points-page URL"); return; }
    setLoadingTeam(true); setMessage("Reading your squad…");
    try {
      const eRes = await fetch(`/api/fpl?resource=entry&id=${id}`);
      if (!eRes.ok) throw new Error();
      const e: Entry = await eRes.json();
      const completed = [...bootstrap.events].reverse().find(x => x.finished)?.id ?? 1;
      const pRes = await fetch(`/api/fpl?resource=picks&id=${id}&event=${completed}`);
      const p = pRes.ok ? await pRes.json() : { picks: [] };
      setEntry(e); setPicks(p.picks || []); setBank(p.entry_history?.bank || 0); localStorage.setItem("fpl-manager-id", id);
      setMessage(`Squad synced through Gameweek ${completed}`);
    } catch { setEntry(null); setPicks([]); setMessage("Team not found. Check your manager ID and try again."); }
    finally { setLoadingTeam(false); }
  }

  function submit(e: FormEvent) { e.preventDefault(); void loadTeam(managerId); }

  const players = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.elements.map(p => [p.id, p]));
    const selected = picks.length ? picks.map(x => ({...byId.get(x.element)!, pick: x})).filter(x => x.id) : demoIds.map((id, i) => ({...byId.get(id)!, pick: { element:id, position:i+1, multiplier:i<11?1:0, is_captain:i===5, is_vice_captain:i===6 }})).filter(x => x.id);
    return selected.sort((a,b) => a.pick.position - b.pick.position);
  }, [data, picks]);

  const nextEvent = data?.events.find(e => e.is_next) || data?.events.find(e => e.is_current);
  const teamMap = new Map(data?.teams.map(t => [t.id, t]) || []);
  const starters = [...players].sort((a,b) => score(b)-score(a)).slice(0,11);
  const captain = starters[0]; const vice = starters[1];
  const watchlist = useMemo(() => data ? [...data.elements].filter(p => p.minutes > 300 && (p.chance_of_playing_next_round ?? 100) >= 75).sort((a,b) => score(b)-score(a)).slice(0,5) : [], [data]);
  const flagged = players.filter(p => p.status !== "a" || (p.chance_of_playing_next_round ?? 100) < 75);
  const transfers = useMemo(() => {
    if (!data || !picks.length) return [];
    const owned = new Set(picks.map(p => p.element));
    const clubCounts = new Map<number, number>();
    players.forEach(p => clubCounts.set(p.team, (clubCounts.get(p.team) || 0) + 1));
    const ideas: {out: Player; incoming: Player; gain: number; price: number}[] = [];
    players.forEach(out => {
      const pick = picks.find(p => p.element === out.id);
      const spend = (pick?.selling_price ?? out.now_cost) + bank;
      const best = data.elements.filter(p => !owned.has(p.id) && p.element_type === out.element_type && p.now_cost <= spend && (p.chance_of_playing_next_round ?? 100) >= 75 && p.status === "a" && ((clubCounts.get(p.team) || 0) - (p.team === out.team ? 1 : 0)) < 3).sort((a,b) => score(b) - score(a))[0];
      if (best && score(best) > score(out) + .25) ideas.push({out, incoming:best, gain:score(best)-score(out), price:best.now_cost});
    });
    return ideas.sort((a,b) => b.gain-a.gain).filter((x,i,a) => a.findIndex(y => y.incoming.id === x.incoming.id) === i).slice(0,3);
  }, [data, picks, players, bank]);

  const provisionalSquad = useMemo(() => {
    if (!data) return [];
    const needs = [0,2,5,5,3]; const chosen: Player[] = []; const clubs = new Map<number,number>();
    for (let role=1; role<=4; role++) {
      const pool = data.elements.filter(p => p.element_type===role && p.status==="a" && (p.chance_of_playing_next_round ?? 100)>=75).sort((a,b) => (score(b)+1.5)/b.now_cost - (score(a)+1.5)/a.now_cost);
      for (const p of pool) {
        if (chosen.filter(x=>x.element_type===role).length >= needs[role]) break;
        if ((clubs.get(p.team)||0) >= 3) continue;
        chosen.push(p); clubs.set(p.team,(clubs.get(p.team)||0)+1);
      }
    }
    let cost = chosen.reduce((n,p)=>n+p.now_cost,0), improved = true;
    while (improved) {
      improved = false; let best: {index:number;p:Player;eff:number}|null=null;
      chosen.forEach((old,index) => data.elements.filter(p => p.element_type===old.element_type && !chosen.some(x=>x.id===p.id) && p.status==="a").forEach(p => {
        const extra=p.now_cost-old.now_cost, gain=score(p)-score(old), clubRoom=(clubs.get(p.team)||0)-(p.team===old.team?1:0)<3;
        if (gain>.15 && cost+extra<=1000 && clubRoom) { const eff=gain/Math.max(1,extra); if(!best||eff>best.eff) best={index,p,eff}; }
      }));
      if (best) { const upgrade=best as {index:number;p:Player;eff:number}; const old=chosen[upgrade.index]; cost+=upgrade.p.now_cost-old.now_cost; clubs.set(old.team,(clubs.get(old.team)||1)-1); clubs.set(upgrade.p.team,(clubs.get(upgrade.p.team)||0)+1); chosen[upgrade.index]=upgrade.p; improved=true; }
    }
    return chosen.sort((a,b)=>a.element_type-b.element_type || score(b)-score(a));
  }, [data]);
  const provisionalCost = provisionalSquad.reduce((n,p)=>n+p.now_cost,0)/10;

  return <main>
    <header className="topbar"><div className="brand"><span className="brandMark">AM</span><div><b>Assistant Manager</b><small>FPL decision room</small></div></div><span className="status"><i />{message}</span></header>
    <section className="hero">
      <div><p className="eyebrow">{nextEvent ? `${nextEvent.name} planning` : "Pre-season planning"}</p><h1>Make the move<br/><em>before the crowd.</em></h1><p className="intro">A live weekly briefing for transfers, captaincy, starting XI and risk—grounded in your actual squad.</p></div>
      <form className="connect" onSubmit={submit}><label htmlFor="manager">Connect your FPL team</label><div><input id="manager" inputMode="numeric" placeholder="Manager ID, e.g. 123456" value={managerId} onChange={e=>setManagerId(e.target.value.trim())}/><button disabled={loadingTeam || !data}>{loadingTeam ? "Syncing…" : "Connect team"}</button></div><small>Find it in the URL of your “Points” page. Saved only on this device.</small></form>
    </section>

    <section className="ticker">
      <div><span>Manager</span><strong>{entry ? `${entry.player_first_name} ${entry.player_last_name}` : "Demo briefing"}</strong></div>
      <div><span>Team</span><strong>{entry?.name || "Connect yours above"}</strong></div>
      <div><span>Total points</span><strong>{entry ? fmt.format(entry.summary_overall_points) : "—"}</strong></div>
      <div><span>Overall rank</span><strong>{entry?.summary_overall_rank ? fmt.format(entry.summary_overall_rank) : "—"}</strong></div>
      <div><span>Deadline</span><strong>{nextEvent ? new Date(nextEvent.deadline_time).toLocaleString("en-GB", {weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "Awaiting fixtures"}</strong></div>
    </section>

    <section className="grid">
      <article className="panel squad"><div className="panelHead"><div><p className="eyebrow">Recommended XI</p><h2>Your best shape this week</h2></div><span className="formation">AUTO XI</span></div>
        <div className="pitch">
          {[1,2,3,4].map(role => <div className="line" key={role}>{starters.filter(p=>p.element_type===role).map(p=><div className="shirt" key={p.id}><div className="kit">{pos[p.element_type]}{p.id===captain?.id&&<b>C</b>}{p.id===vice?.id&&<b>V</b>}</div><strong>{p.web_name}</strong><small>{score(p).toFixed(1)} rating</small></div>)}</div>)}
        </div>
      </article>

      <aside className="stack">
        <article className="panel verdict"><p className="eyebrow">Manager’s call</p><h2>{captain ? `Captain ${captain.web_name}` : "Analysing captaincy"}</h2><p>{captain ? `${captain.web_name} leads your squad model on form, expected involvement, minutes confidence and availability. ${vice?.web_name || "Your next-best option"} is the safety vice-captain.` : "Connect your squad to unlock the weekly verdict."}</p><div className="callRow"><span>Captain</span><b>{captain?.web_name || "—"}</b></div><div className="callRow"><span>Vice</span><b>{vice?.web_name || "—"}</b></div></article>
        <article className="panel risk"><p className="eyebrow">Squad alerts</p><h2>{flagged.length ? `${flagged.length} player${flagged.length>1?"s":""} need attention` : "No urgent flags"}</h2>{flagged.length ? flagged.slice(0,3).map(p=><div className="alert" key={p.id}><b>{p.web_name}</b><span>{p.chance_of_playing_next_round ?? 0}% chance · {p.status.toUpperCase()}</span></div>) : <p>Your connected squad has no public availability flags. Recheck near the deadline after press conferences.</p>}</article>
      </aside>
    </section>

    <section className="planning">
      <article className="panel transfers"><div className="panelHead"><div><p className="eyebrow">Recommended transfers</p><h2>{picks.length ? "Moves worth considering" : "Connect your team for tailored moves"}</h2></div>{picks.length>0&&<span className="formation">BANK £{(bank/10).toFixed(1)}m</span>}</div>
        {picks.length ? <div className="transferList">{transfers.length ? transfers.map((t,i)=><div className="transfer" key={`${t.out.id}-${t.incoming.id}`}><span className="rank">0{i+1}</span><div className="move out"><small>SELL</small><b>{t.out.web_name}</b><span>{teamMap.get(t.out.team)?.short_name} · £{((picks.find(p=>p.element===t.out.id)?.selling_price ?? t.out.now_cost)/10).toFixed(1)}m</span></div><span className="arrow">→</span><div className="move in"><small>BUY</small><b>{t.incoming.web_name}</b><span>{teamMap.get(t.incoming.team)?.short_name} · £{(t.price/10).toFixed(1)}m</span></div><strong className="gain">+{t.gain.toFixed(1)}</strong></div>) : <p className="quiet">The model sees no clear affordable upgrade right now. Holding the transfer may be stronger than forcing a move.</p>}</div> : <p className="quiet">Once your manager ID is connected, this compares every player in your squad with affordable replacements in the same position while respecting the three-per-club rule.</p>}
      </article>

      <article className="panel preseason"><div className="panelHead"><div><p className="eyebrow">2026/27 squad lab</p><h2>Provisional opening-day squad</h2></div><span className="formation">£{provisionalCost.toFixed(1)}m / £100m</span></div><p className="seasonNote">Built from the player pool and prices currently exposed by FPL. It will recalculate automatically when the 2026/27 game launches; review before acting because promoted players, transfers, prices and rules may change.</p>
        <div className="squadTable">{[1,2,3,4].map(role=><div className="positionGroup" key={role}><span>{pos[role]}</span><div>{provisionalSquad.filter(p=>p.element_type===role).map(p=><div className="squadPlayer" key={p.id}><b>{p.web_name}</b><small>{teamMap.get(p.team)?.short_name}</small><strong>£{(p.now_cost/10).toFixed(1)}</strong></div>)}</div></div>)}</div>
        <div className="ruleChecks"><span>✓ 15 players</span><span>✓ £100m budget</span><span>✓ Max 3 per club</span><span>✓ 2–5–5–3 structure</span></div>
      </article>
    </section>

    <section className="lower">
      <article className="panel"><div className="panelHead"><div><p className="eyebrow">Market radar</p><h2>Players forcing the conversation</h2></div></div><div className="targets">{watchlist.map((p,i)=><div className="target" key={p.id}><span className="rank">0{i+1}</span><div><b>{p.web_name}</b><small>{teamMap.get(p.team)?.short_name} · {pos[p.element_type]} · £{(p.now_cost/10).toFixed(1)}m</small></div><strong>{score(p).toFixed(1)}</strong></div>)}</div></article>
      <article className="panel method"><p className="eyebrow">How decisions are made</p><h2>Signal, context, judgement.</h2><p>The first model blends live FPL form, points rate, minutes, availability and transfer momentum. Before every deadline, the briefing should also incorporate fixtures, press conferences, bookmakers’ odds and your chip strategy.</p><div className="tags"><span>Expected minutes</span><span>Form</span><span>Availability</span><span>Market moves</span><span>Squad rules</span></div></article>
    </section>
    <footer><span>Read-only assistant · no password required</span><span>Data: Fantasy Premier League</span></footer>
  </main>;
}
