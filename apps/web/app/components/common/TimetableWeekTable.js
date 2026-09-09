'use client';

const ttTable = { width: '100%', borderCollapse: 'collapse', border: '1px solid #cbd5e1', background: '#fff', tableLayout: 'fixed' };
const ttTh = { border: '1px solid #cbd5e1', background: '#eff6ff', padding: '6px 6px', fontSize: 13, textAlign: 'left' };
const ttTd = { border: '1px solid #e2e8f0', padding: '4px 6px', fontSize: 13, wordBreak: 'break-word' };

export function TimetableWeekTable({ weekData, emptyText }) {
  const weekdayOrder = [1, 2, 3, 4, 5];
  const weekdayLabel = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금' };
  const hasAny = weekdayOrder.some((day) => Array.isArray(weekData?.[day]) && weekData[day].length > 0);
  if (!hasAny) return <p style={{ color: '#64748b' }}>{emptyText}</p>;

  const periodSet = new Set();
  weekdayOrder.forEach((day) => (weekData?.[day] || []).forEach((row) => periodSet.add(Number(row.period))));
  const periods = Array.from(periodSet).sort((a, b) => a - b);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={ttTable}>
        <colgroup>
          <col style={{ width: 48 }} />
          <col style={{ width: 74 }} />
          {weekdayOrder.map((day) => <col key={`col_${day}`} style={{ width: 'calc((100% - 122px) / 5)' }} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...ttTh, textAlign: 'center', height: 34 }}>교시</th>
            <th style={{ ...ttTh, textAlign: 'center', height: 34 }}>시간</th>
            {weekdayOrder.map((day) => <th key={day} style={{ ...ttTh, textAlign: 'center', height: 34 }}>{weekdayLabel[day]}</th>)}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const ref = weekdayOrder.flatMap((day) => weekData?.[day] || []).find((row) => Number(row.period) === period);
            return (
              <tr key={period}>
                <td style={{ ...ttTd, textAlign: 'center', verticalAlign: 'middle', height: 34 }}>{period}</td>
                <td style={{ ...ttTd, textAlign: 'center', verticalAlign: 'middle', height: 34 }}>{ref?.time || '-'}</td>
                {weekdayOrder.map((day) => {
                  const cell = (weekData?.[day] || []).find((row) => Number(row.period) === period);
                  return (
                    <td
                      key={`${day}_${period}`}
                      style={{ ...ttTd, whiteSpace: 'pre-line', textAlign: 'center', verticalAlign: 'middle', height: 34, background: cell?.isChanged ? '#ffff66' : '#fff' }}
                    >
                      {cell?.text || '-'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
