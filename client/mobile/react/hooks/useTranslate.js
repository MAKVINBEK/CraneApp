import { useCallback } from 'react';

export const useTranslate = () => {
    const t = useCallback((key, fallback, vars) => {
        // Безопасное обращение к window.i18n
        const val = window.i18n?.t(key, vars);

        // Если перевод найден и он не равен самому ключу, возвращаем его, иначе — фолбек
        return (val && val !== key) ? val : fallback;
    }, []); // Массив зависимостей пустой, так как функция зависит только от window

    return { t };
};