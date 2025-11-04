export default function VItem({ 
  item, 
  index, 
  isVisible, 
  isActive, 
  onSelect, 
  onDelete,
  onToggleFavorite,
  isFavorite = false
}) {
  const parseTrackTitle = (title) => {
    if (!title) return { song: '', artist: '' }
    const match = title.match(/^(.+?)(?:\s{2,}|\s-\s)(.+)$/)
    if (match) {
      const song = match[1].trim()
      const artist = match[2].trim()
      return { song, artist }
    }
    return { song: title, artist: '' }
  }

  const { song, artist } = parseTrackTitle(item.title)

  if (!isVisible) {
    return (
      <div 
        className="playlist-item-placeholder"
        style={{ 
          height: '100%', 
          opacity: 0,
          pointerEvents: 'none'
        }}
      />
    )
  }

  return (
    <li
      className={`playlist-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(index)}
      role="option"
      aria-selected={isActive}
    >
      <span className="index" style={{ color: 'var(--sub)' }}>
        {index + 1}
      </span>
      
      <span 
        className="name" 
        style={{ 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis' 
        }}
      >
        {artist ? `${song} - ${artist}` : song}
      </span>
      
      <div 
        className="actions-inline" 
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '12px' 
        }}
      >
        {item.mvUrl ? (
          <a
            className="download-link"
            href={item.mvUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`打开MV ${song}${artist ? ' - ' + artist : ''}`}
            style={{
              color: 'var(--sub)',
              textDecoration: 'none',
              fontSize: '13px',
              padding: '0',
              border: 'none',
              verticalAlign: 'baseline',
              fontFamily: 'inherit'
            }}
            onMouseEnter={(e) => e.target.style.color = '#ff8fb3'}
            onMouseLeave={(e) => e.target.style.color = 'var(--sub)'}
          >
            MV
          </a>
        ) : null}
        
        <button
          type="button"
          className="favorite-btn"
          onClick={(e) => { 
            e.stopPropagation()
            onToggleFavorite && onToggleFavorite(item.url, !isFavorite)
          }}
          aria-label={`${isFavorite ? '取消收藏' : '收藏'} ${song}${artist ? ' - ' + artist : ''}`}
          id={`favorite-btn-${item.url}`}
          name="favorite"
          style={{
            color: isFavorite ? '#ff8fb3' : 'var(--sub)',
            background: 'transparent',
            border: 'none',
            fontSize: '16px',
            padding: '0',
            cursor: 'pointer',
            verticalAlign: 'baseline',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            transition: 'color 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!isFavorite) {
              e.currentTarget.style.color = '#ff8fb3'
            }
          }}
          onMouseLeave={(e) => {
            if (!isFavorite) {
              e.currentTarget.style.color = 'var(--sub)'
            }
          }}
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill={isFavorite ? 'currentColor' : 'none'} 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        
        <button
          type="button"
          className="delete-link"
          onClick={(e) => { 
            e.stopPropagation()
            onDelete && onDelete(item.url) 
          }}
          aria-label={`删除 ${song}${artist ? ' - ' + artist : ''}`}
          id={`delete-btn-${item.url}`}
          name="delete"
          style={{
            color: 'var(--sub)',
            background: 'transparent',
            border: 'none',
            fontSize: '13px',
            padding: '0',
            cursor: 'pointer',
            verticalAlign: 'baseline',
            fontFamily: 'inherit'
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8fb3'}
          onMouseLeave={(e) => e.target.style.color = 'var(--sub)'}
        >
          删除
        </button>
        
        <a
          className="download-link"
          href={item.url}
          download
          onClick={(e) => e.stopPropagation()}
          aria-label={`下载 ${song}${artist ? ' - ' + artist : ''}`}
          style={{
            color: 'var(--sub)',
            textDecoration: 'none',
            fontSize: '13px',
            padding: '0',
            border: 'none',
            verticalAlign: 'baseline',
            fontFamily: 'inherit'
          }}
          onMouseEnter={(e) => e.target.style.color = '#ff8fb3'}
          onMouseLeave={(e) => e.target.style.color = 'var(--sub)'}
        >
          下载
        </a>
      </div>
    </li>
  )
}
