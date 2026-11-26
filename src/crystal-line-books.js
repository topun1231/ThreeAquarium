import {validateShrimpName} from './crystal-traits.js';

// Only hatched individuals have records. Both parents can lead to the same child.
export function childrenByParent(individuals) {
  const children = new Map();
  for (const record of individuals) {
    for (const parentId of record.parents || []) {
      if (!children.has(parentId)) children.set(parentId, []);
      children.get(parentId).push(record.id);
    }
  }
  return children;
}

// Preserve one shortest documented route for display, even when two branches reconnect.
export function familyRoutes(children, founderId) {
  const previous = new Map([[founderId, null]]), queue = [founderId];
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index];
    for (const child of children.get(parent) || []) {
      if (previous.has(child)) continue;
      previous.set(child, parent);
      queue.push(child);
    }
  }
  return previous;
}

export function booksForDescendant(record, byId, books) {
  if (!books?.length || !record.parents) return [];
  const ancestors = new Set(record.parents);
  for (const id of ancestors) {
    for (const parentId of byId.get(id)?.parents || []) ancestors.add(parentId);
  }
  return books.filter(book => ancestors.has(book.founderId));
}

export function validateLineBooks(books, records) {
  if (books === undefined) return;
  if (!Array.isArray(books) || books.length > records.size) throw Error('选育手记的本数无效');
  const founders = new Set();
  let children;
  for (const book of books) {
    const founder = records.get(book?.founderId);
    if (!founder || founder.legacy || founders.has(founder.id)) throw Error('选育手记的起点无效或重复');
    founders.add(founder.id);
    validateShrimpName(book.title);
    if (!Array.isArray(book.members) || book.members.length >= records.size || new Set(book.members).size !== book.members.length) {
      throw Error('选育手记的个体记录无效或重复');
    }
    if (book.members.length) {
      children ??= childrenByParent(records.values());
      const routes = familyRoutes(children, founder.id);
      if (!book.members.every(id => id !== founder.id && routes.has(id))) throw Error('手记成员必须是起点已有出生记录的后代');
    }
  }
}

export function editLineBook(state, action) {
  const books = state.lineBooks || [];
  const book = books.find(item => item.founderId === action.founderId);
  if (action.type === 'nameLineBook') {
    const title = validateShrimpName(action.title);
    if (book?.title === title) return;
    if ((book?.title ?? null) !== action.previousTitle) throw Error('手记名字已有变化，请重新打开后再改名');
    if (book) book.title = title;
    else (state.lineBooks ??= []).push({founderId:action.founderId, title, members:[]});
    return;
  }
  if (!book) throw Error('这本选育手记已不在相册中');
  if (action.type === 'discardLineBook') {
    if (book.title !== action.previousTitle || JSON.stringify(book.members) !== JSON.stringify(action.previousMembers)) {
      throw Error('手记内容已有变化，请重新核对后再删除');
    }
    state.lineBooks = books.filter(item => item !== book);
    if (!state.lineBooks.length) delete state.lineBooks;
    return;
  }
  if (typeof action.marked !== 'boolean') throw Error('请选择要记下或移出手记的虾');
  if (action.marked) {
    if (!book.members.includes(action.id)) book.members.push(action.id);
  } else {
    if (!book.members.includes(action.id) && (action.id === book.founderId ||
      !familyRoutes(childrenByParent(state.individuals), book.founderId).has(action.id))) {
      throw Error('请选择这本手记中的后代');
    }
    book.members = book.members.filter(id => id !== action.id);
  }
}
