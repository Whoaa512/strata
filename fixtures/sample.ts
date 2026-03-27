export function simpleFunction(x: number): number {
  return x + 1;
}

export function complexFunction(items: any[], filter: string): any[] {
  const result: any[] = [];

  for (const item of items) {
    if (item.type === filter) {
      if (item.active) {
        if (item.score > 10) {
          result.push(item);
        } else {
          if (item.fallback) {
            result.push(item.fallback);
          }
        }
      }
    } else if (item.type === "wildcard") {
      for (const sub of item.children) {
        if (sub.active) {
          result.push(sub);
        }
      }
    }
  }

  return result;
}

export async function fetchData(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

export class UserService {
  private cache = new Map<string, any>();

  async getUser(id: string): Promise<any> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }
    const user = await fetchData(`/users/${id}`);
    if (user) {
      this.cache.set(id, user);
    }
    return user;
  }

  async updateUser(id: string, data: any): Promise<boolean> {
    const user = await this.getUser(id);
    if (!user) return false;
    Object.assign(user, data);
    this.cache.set(id, user);
    return true;
  }
}
