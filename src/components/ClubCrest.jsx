import { useEffect, useState } from 'react';
import { useClubLogos } from '../hooks/useClubLogos';

/**
 * Circular club/country badge, resolved from the club_logos table.
 * Falls back to a dashed ghost ring — never a broken image — when the name
 * isn't mapped yet or the image fails to load.
 */
export default function ClubCrest({ name, size = 20 }) {
  const logos = useClubLogos();
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [name]);

  const url = name ? logos?.[name] : null;

  if (!url || failed) {
    return (
      <div
        style={{
          width:        size,
          height:       size,
          borderRadius: '50%',
          border:       '1.5px dashed var(--rule)',
          flexShrink:   0,
        }}
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{
        width:        size,
        height:       size,
        borderRadius: '50%',
        objectFit:    'contain',
        background:   'rgba(255,255,255,0.06)',
        flexShrink:   0,
      }}
      onError={() => setFailed(true)}
    />
  );
}
