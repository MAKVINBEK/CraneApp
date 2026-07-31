export function cn(...classNames) {
  const classes = classNames.map((className) => {
    if (!className) return "";

    if (Array.isArray(className)) return cn(...className);

    if (typeof className === "object" && className) {
      return Object.entries(className).map(([key, value]) => {
        if (value && (key !== "undefined" || key !== undefined)) {
          return key;
        }
      });
    }

    return className;
  });

  return classes.filter(Boolean).join(" ");
}
