// Som curto de alerta (Web Audio) — tocado quando uma notificação in-app chega.
// Não usa arquivo de áudio: gera dois "dings" ascendentes via oscilador. É
// best-effort — se o navegador bloquear áudio (autoplay/sem interação), silencia
// sem quebrar nada. O AudioContext é criado uma vez e reaproveitado.

let ctx: AudioContext | null = null;

export function playAlertSound(): void {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const tones: [number, number][] = [
      [880, 0], // Lá5
      [1174.66, 0.13], // Ré6 — segundo ding, levemente depois
    ];
    for (const [freq, delay] of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      const t = now + delay;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.start(t);
      o.stop(t + 0.2);
    }
  } catch {
    /* som é best-effort; ignora falhas */
  }
}
