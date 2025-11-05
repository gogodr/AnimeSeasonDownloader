/**
 * Determines current quarter based on date
 * Q1 = Winter (Jan-Mar), Q2 = Spring (Apr-Jun), Q3 = Summer (Jul-Sep), Q4 = Fall (Oct-Dec)
 * @returns {string} Current quarter (Q1, Q2, Q3, Q4)
 */
export function getCurrentQuarter() {
    const today = new Date();
    const month = today.getMonth();
    if (month < 3) return "Q1";      // Jan-Mar (Winter)
    if (month < 6) return "Q2";      // Apr-Jun (Spring)
    if (month < 9) return "Q3";      // Jul-Sep (Summer)
    return "Q4";                      // Oct-Dec (Fall)
}

