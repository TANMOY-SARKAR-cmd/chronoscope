export type ConsentedTooltipLeader = {
  setupLabel: string;
  hardwareTags: string[];
  uncertaintyMs: number;
  isConsented: boolean;
};

export function getConsentedTooltipRows(point: Record<string, number>, leaders: ConsentedTooltipLeader[], visibleSeries: Record<string, boolean>) {
  return leaders.flatMap((leader, index) => {
    const key = `leader_${index}`;
    const offsetMs = point[key];
    if (!leader.isConsented || visibleSeries[key] === false || !Number.isFinite(offsetMs)) return [];
    return [{ label: leader.setupLabel, offsetMs, uncertaintyMs: leader.uncertaintyMs, hardwareTags: leader.hardwareTags }];
  });
}

export function getChartSeriesTransition(visible: boolean, reduceMotion: boolean) {
  return { strokeOpacity: visible ? 1 : 0, animationDuration: reduceMotion ? 0 : 220 };
}
