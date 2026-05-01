const FLAG_STYLE = {
  ERROR_NEGATIVE_DELTA: 'badge-red',
  ERROR_OVERFLOW: 'badge-red',
  ERROR_NON_NUMERIC_TICKET: 'badge-red',
  MISSING_START: 'badge-red',
  WARNING_SMALL_MISMATCH: 'badge-yellow',
  WARNING_DUPLICATE_SCAN: 'badge-yellow',
  WARNING_NEW_BOOK: 'badge-yellow',
}

const FLAG_LABEL = {
  ERROR_NEGATIVE_DELTA: 'Negative delta',
  ERROR_OVERFLOW: 'Overflow',
  ERROR_NON_NUMERIC_TICKET: 'Non-numeric',
  MISSING_START: 'Missing start',
  WARNING_SMALL_MISMATCH: 'Near full',
  WARNING_DUPLICATE_SCAN: 'Duplicate scan',
  WARNING_NEW_BOOK: 'New book',
}

export default function FlagBadge({ flag }) {
  return (
    <span className={FLAG_STYLE[flag] || 'badge-gray'}>
      {FLAG_LABEL[flag] || flag}
    </span>
  )
}

export function isError(flag) {
  return flag.startsWith('ERROR_') || flag === 'MISSING_START'
}
