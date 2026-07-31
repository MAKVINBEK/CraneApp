// components/Icon.tsx
import React from 'react';

// Список иконок, работающих через заливку
const FILLED_ICONS = ['reply', 'edit', 'trash', 'phone', 'video', 'copy'];

export const Icon = ({ name, size = 24, className = '', ...props}) => {
    const isFilled = FILLED_ICONS.includes(name);
    return (
        <svg
            width={size}
            height={size}
            className={`opacity-90 ${className}`}
            aria-hidden="true"
            // Динамическое переключение стилей в зависимости от типа иконки
            fill={isFilled ? 'currentColor' : 'none'}
            stroke={isFilled ? 'none' : 'currentColor'}
            strokeWidth={isFilled ? undefined : '2'}
            strokeLinecap={isFilled ? undefined : 'round'}
            strokeLinejoin={isFilled ? undefined : 'round'}
            {...props}
        >
            <use href={`/sprite.svg#icon-${name}`} />
        </svg>
    );
};
