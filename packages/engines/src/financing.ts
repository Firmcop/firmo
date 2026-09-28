import { round2 } from './math';

export interface LoanInput {
  principal: number;
  annualRatePct: number;
  tenureYears: number;
  /** Interest-only months at the start of the tenure. */
  graceMonths: number;
}

export interface LoanMonth { month: number; payment: number; interest: number; principal: number; balance: number; }

export interface LoanResult {
  monthlyPayment: number;
  graceMonthlyInterest: number;
  annualDebtService: number[];
  totalInterest: number;
  schedule: LoanMonth[];
}

export function amortize(i: LoanInput): LoanResult {
  if (i.principal < 0) throw new Error('principal must be >= 0');
  const n = Math.round(i.tenureYears * 12);
  const amortMonths = n - i.graceMonths;
  if (amortMonths <= 0) throw new Error('grace period must be shorter than tenure');
  const r = i.annualRatePct / 1200;
  const P = i.principal;
  const payment = P === 0 ? 0 : r === 0 ? P / amortMonths : (P * r) / (1 - Math.pow(1 + r, -amortMonths));

  let bal = P, totalInterest = 0;
  const schedule: LoanMonth[] = [];
  for (let m = 1; m <= n; m++) {
    const interest = bal * r;
    const inGrace = m <= i.graceMonths;
    const pay = inGrace ? interest : payment;
    const princ = inGrace ? 0 : pay - interest;
    bal = Math.max(0, bal - princ);
    totalInterest += interest;
    schedule.push({ month: m, payment: round2(pay), interest: round2(interest), principal: round2(princ), balance: round2(bal) });
  }
  const years = Math.ceil(n / 12);
  const annualDebtService = Array.from({ length: years }, (_, y) =>
    round2(schedule.slice(y * 12, y * 12 + 12).reduce((a, m) => a + m.payment, 0)));

  return {
    monthlyPayment: round2(payment),
    graceMonthlyInterest: round2(P * r),
    annualDebtService,
    totalInterest: round2(totalInterest),
    schedule,
  };
}

export interface FinancingCalcInput extends Omit<LoanInput, 'principal'> {
  projectCost: number;
  equityPct: number;
  /** Steady-state EBITDA used to compute DSCR. */
  annualEbitda: number;
}

/** Public financing calculator. Output is illustrative only. */
export function financingCalculator(i: FinancingCalcInput) {
  const equity = i.projectCost * (i.equityPct / 100);
  const loan = i.projectCost - equity;
  const res = amortize({ principal: loan, annualRatePct: i.annualRatePct, tenureYears: i.tenureYears, graceMonths: i.graceMonths });
  const fullYearDs = res.monthlyPayment * 12;
  const dscr = fullYearDs > 0 ? i.annualEbitda / fullYearDs : null;
  return {
    equityRequired: round2(equity),
    loanAmount: round2(loan),
    monthlyRepayment: res.monthlyPayment,
    graceMonthlyInterest: res.graceMonthlyInterest,
    annualDebtService: round2(fullYearDs),
    dscr: dscr === null ? null : Math.round(dscr * 100) / 100,
    cashAfterDebtService: round2(i.annualEbitda - fullYearDs),
    disclaimer: 'Illustrative model based on stated assumptions. Financing subject to applicant eligibility, financier credit assessment and final project documentation.',
  };
}
