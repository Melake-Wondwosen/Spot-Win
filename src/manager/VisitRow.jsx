import { amountText } from '../components/ui'
import { dateTime } from '../time'
import { isVoid, text } from './calc'
import { useThumb } from './photos'

// One visit in a list: both photo thumbnails, when, where, who, how much
export function VisitRow({ v, onOpen, showStatus }) {
  const receipt = useThumb(text(v.receiptPhotoId))
  const engagement = useThumb(text(v.engagementPhotoId))
  const off = isVoid(v)
  return (
    <li>
      <button type="button" onClick={onOpen} className={`row-hover w-full text-left px-2 -mx-2 rounded-lg py-2.5 flex items-center gap-3 ${off ? 'opacity-45' : ''}`}>
        <span className="flex gap-1.5 shrink-0">
          <Mini src={receipt} />
          <Mini src={engagement} />
        </span>
        <span className="flex-1 min-w-0 grid sm:grid-cols-[90px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-x-3 items-center text-sm">
          <span className="text-ink/55 tabular text-xs sm:text-sm">{dateTime(v.date)}</span>
          <span className="font-semibold truncate">
            {text(v.outletName)} <span className="font-normal text-ink/45 tabular">{text(v.outletId)}</span>
          </span>
          <span className="text-ink/65 truncate">{text(v.userName)}</span>
          <span className="text-ink/65 truncate hidden sm:block">{text(v.activity)}</span>
          <span className="font-semibold text-gold-dark sm:text-right tabular whitespace-nowrap">
            {amountText(text(v.investmentUnit), v.amount)}
            {(off || showStatus) && <span className="ml-2 text-[10px] font-bold rounded-full bg-ink/10 text-ink/60 px-1.5 py-0.5 align-middle">{off ? 'VOID' : 'SAVED'}</span>}
          </span>
        </span>
      </button>
    </li>
  )
}

function Mini({ src }) {
  return <span className="thumb-hover w-10 h-10 rounded-lg bg-mist overflow-hidden block">{src ? <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" /> : src === '' ? null : <span className="block w-full h-full skeleton" />}</span>
}
