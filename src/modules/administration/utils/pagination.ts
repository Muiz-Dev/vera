export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function paginate<T>(
  model: any,
  queryOptions: any,
  params: PaginationParams
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, params.page);
  const limit = Math.max(1, Math.min(100, params.limit));
  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    model.count({ where: queryOptions.where }),
    model.findMany({
      ...queryOptions,
      skip,
      take: limit,
      orderBy: params.sortBy
        ? { [params.sortBy]: params.sortOrder || "desc" }
        : queryOptions.orderBy,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}
