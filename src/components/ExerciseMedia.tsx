import React, { useState } from 'react';
import type { ExerciseData, ExerciseImageRecord, Lang } from '../types';
import { TRANSLATIONS } from '../i18n/translations';

interface ExerciseMediaProps {
  exercise: ExerciseData;
  publishedImages: ExerciseImageRecord[];
  lang: Lang;
  size?: 'thumb' | 'hero';
}

/**
 * Renders verified exercise imagery or VOXA's original biomechanical vector diagram.
 * - Never renders unverified/unpublished external images.
 * - Gracefully handles external image load errors with a clear local fallback badge instead of a broken image.
 */
export const ExerciseMedia: React.FC<ExerciseMediaProps> = ({
  exercise,
  publishedImages,
  lang,
  size = 'thumb'
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const t = TRANSLATIONS[lang].library;

  // Prefer verified published non-illustration photo if owner published one with valid provenance
  const verifiedExternal = publishedImages.find(
    (img) =>
      img.exerciseId === exercise.id &&
      img.status === 'published' &&
      !img.isIllustration &&
      !img.imageUrl.startsWith('voxa-illustration://')
  );

  if (verifiedExternal && !imgFailed) {
    return (
      <div className={`ex-media-wrap ${size}`}>
        <img
          src={verifiedExternal.imageUrl}
          alt={lang === 'ar' ? exercise.ar : exercise.en}
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
        {size === 'hero' && (
          <div className="media-provenance-bar">
            <span className="gold-dot" />
            <span>{t.verifiedMediaBadge}:</span>
            <a href={verifiedExternal.sourceUrl} target="_blank" rel="noreferrer">
              {verifiedExternal.sourceName}
            </a>
            <span>({verifiedExternal.license})</span>
          </div>
        )}
      </div>
    );
  }

  // Original Biomechanical Vector Diagram tailored by movement pattern & equipment
  return (
    <div className={`ex-media-wrap ${size} is-vector`}>
      <BiomechanicalVector exercise={exercise} size={size} />
      {size === 'hero' && (
        <div className="media-provenance-bar">
          <span className="gold-dot" />
          <span>{imgFailed ? t.fallbackMediaBadge : t.illustrationBadge}</span>
        </div>
      )}
    </div>
  );
};

const BiomechanicalVector: React.FC<{ exercise: ExerciseData; size: 'thumb' | 'hero' }> = ({
  exercise,
  size
}) => {
  const isHero = size === 'hero';
  const p = exercise.pattern;

  return (
    <svg
      viewBox="0 0 160 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', maxHeight: isHero ? '190px' : '64px' }}
      aria-hidden="true"
    >
      {/* Subtle geometric biomechanical grid */}
      <line x1="16" y1="92" x2="144" y2="92" stroke="#2A2A35" strokeWidth="1.5" />
      <circle cx="80" cy="52" r="36" stroke="#D4AF37" strokeOpacity="0.14" strokeDasharray="3 3" />

      {p === 'push' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Bench / Torso vector */}
          <line x1="38" y1="74" x2="108" y2="74" stroke="#525263" strokeWidth="4" />
          <line x1="52" y1="74" x2="52" y2="92" stroke="#3A3A48" strokeWidth="3" />
          <line x1="96" y1="74" x2="96" y2="92" stroke="#3A3A48" strokeWidth="3" />
          {/* Athlete torso + pressing trajectory */}
          <circle cx="48" cy="64" r="6" fill="#D4AF37" fillOpacity="0.25" stroke="#D4AF37" strokeWidth="1.8" />
          <line x1="56" y1="66" x2="94" y2="66" stroke="#E5E5EC" strokeWidth="3.5" />
          <path d="M68 65 L64 46 L68 28" stroke="#D4AF37" strokeWidth="3" />
          <line x1="50" y1="28" x2="86" y2="28" stroke="#F3DF99" strokeWidth="2.5" />
          <circle cx="53" cy="28" r="5" fill="#D4AF37" />
          <circle cx="83" cy="28" r="5" fill="#D4AF37" />
          <path d="M98 54 L98 30 M94 35 L98 29 L102 35" stroke="#D4AF37" strokeOpacity="0.7" strokeWidth="1.6" />
        </g>
      )}

      {p === 'pull' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Overhead pulley / bar frame */}
          <line x1="48" y1="20" x2="112" y2="20" stroke="#525263" strokeWidth="3" />
          <line x1="80" y1="20" x2="80" y2="38" stroke="#D4AF37" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="2 2" />
          {/* Athlete torso & active back pull */}
          <circle cx="80" cy="48" r="6" fill="#D4AF37" fillOpacity="0.25" stroke="#D4AF37" strokeWidth="1.8" />
          <line x1="80" y1="55" x2="80" y2="82" stroke="#E5E5EC" strokeWidth="3.8" />
          <path d="M60 36 L68 58 L80 58 L92 58 L100 36" stroke="#D4AF37" strokeWidth="2.8" />
          <line x1="56" y1="36" x2="104" y2="36" stroke="#F3DF99" strokeWidth="2.4" />
          <path d="M114 34 L114 58 M110 53 L114 59 L118 53" stroke="#D4AF37" strokeOpacity="0.7" strokeWidth="1.6" />
        </g>
      )}

      {(p === 'squat' || p === 'lunge') && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Squat biomechanics */}
          <circle cx="84" cy="28" r="6" fill="#D4AF37" fillOpacity="0.25" stroke="#D4AF37" strokeWidth="1.8" />
          <line x1="64" y1="36" x2="102" y2="36" stroke="#F3DF99" strokeWidth="2.6" />
          <circle cx="66" cy="36" r="4.5" fill="#D4AF37" />
          <circle cx="100" cy="36" r="4.5" fill="#D4AF37" />
          <line x1="82" y1="36" x2="68" y2="62" stroke="#E5E5EC" strokeWidth="3.6" />
          <line x1="68" y1="62" x2="92" y2="66" stroke="#D4AF37" strokeWidth="3.4" />
          <line x1="92" y1="66" x2="84" y2="91" stroke="#E5E5EC" strokeWidth="3.2" />
          <path d="M112 68 L112 38 M108 43 L112 37 L116 43" stroke="#D4AF37" strokeOpacity="0.75" strokeWidth="1.6" />
        </g>
      )}

      {p === 'hinge' && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Hip-hinge posterior chain */}
          <circle cx="104" cy="36" r="6" fill="#D4AF37" fillOpacity="0.25" stroke="#D4AF37" strokeWidth="1.8" />
          <line x1="98" y1="41" x2="62" y2="56" stroke="#E5E5EC" strokeWidth="3.8" />
          <line x1="62" y1="56" x2="70" y2="91" stroke="#D4AF37" strokeWidth="3.4" />
          <line x1="92" y1="45" x2="92" y2="74" stroke="#B89024" strokeWidth="2.4" />
          <circle cx="92" cy="76" r="6.5" fill="#D4AF37" fillOpacity="0.3" stroke="#F3DF99" strokeWidth="2" />
          <path d="M52 56 C44 56 44 42 54 40" stroke="#D4AF37" strokeOpacity="0.7" strokeWidth="1.6" />
        </g>
      )}

      {(p === 'carry' || p === 'rotation') && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Core bracing line */}
          <circle cx="112" cy="54" r="6" fill="#D4AF37" fillOpacity="0.25" stroke="#D4AF37" strokeWidth="1.8" />
          <line x1="104" y1="58" x2="46" y2="76" stroke="#D4AF37" strokeWidth="3.6" />
          <line x1="102" y1="59" x2="102" y2="88" stroke="#E5E5EC" strokeWidth="3" />
          <line x1="102" y1="88" x2="114" y2="88" stroke="#E5E5EC" strokeWidth="2.8" />
          <line x1="46" y1="76" x2="42" y2="90" stroke="#E5E5EC" strokeWidth="3" />
        </g>
      )}
    </svg>
  );
};
