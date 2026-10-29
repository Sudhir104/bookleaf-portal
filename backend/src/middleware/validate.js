// Validates req[source] with a zod schema; the parsed result lands in req.valid[source].
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) throw result.error; // formatted by errorHandler
  req.valid = { ...req.valid, [source]: result.data };
  next();
};
