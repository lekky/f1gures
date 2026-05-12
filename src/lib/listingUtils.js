export function filterItems(items, { search, nationality }) {
  const q = search.trim().toLowerCase();
  return items.filter(item => {
    const name = `${item.forename || item.name || ''} ${item.surname || ''}`.toLowerCase();
    const matchesSearch = !q || name.includes(q);
    const matchesNat = !nationality || item.nationality === nationality;
    return matchesSearch && matchesNat;
  });
}

export function sortItems(items, { field, dir }) {
  const mult = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = a[field] ?? (typeof b[field] === 'number' ? -Infinity : '');
    const bv = b[field] ?? (typeof a[field] === 'number' ? -Infinity : '');
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

export function paginateItems(items, { page, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), totalPages };
}

export function uniqueNationalities(items) {
  return [...new Set(items.map(i => i.nationality).filter(Boolean))].sort();
}
