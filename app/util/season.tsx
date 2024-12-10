export function getCurrentSeason() : number {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const season = currentMonth >= 8 ? currentYear : currentYear - 1;
    return season;
}