import { filter } from 'lodash';
import { GraphQLError } from 'graphql/error/GraphQLError';

import { toReindexID } from '../builtins/ReindexID';

export default async function validate(
  db,
  context,
  type,
  newObject,
  existingObject,
  interfaces,
) {
  await validateUnique(db, context, type, newObject, existingObject);
  await validateNodesExist(db, interfaces, type, newObject, existingObject);
}

async function validateUnique(
  db,
  context,
  type,
  newObject,
  existingObject = {}
) {
  const uniqueFields = filter(type.getFields(),
    (field) => (
      field.name !== 'id' &&
      field.metadata && field.metadata.unique &&
      newObject[field.name] !== existingObject[field.name]
    )
  );

  const uniqueChecks = await* uniqueFields.map((field) => db.getByField(
    type.name,
    field.name,
    newObject[field.name],
    context.rootValue.indexes[type.name],
  ));

  for (const index in uniqueFields) {
    const field = uniqueFields[index];
    const check = uniqueChecks[index];
    if (check) {
      throw new GraphQLError(
        `${type.name}.${field.name}: value must be unique, got ` +
        `${JSON.stringify(newObject[field.name])}`
      );
    }
  }
}

async function validateNodesExist(
  db,
  interfaces,
  type,
  newObject,
  existingObject = {},
) {
  const nodeFields = filter(type.getFields(), (field) =>
    newObject[field.name] &&
    newObject[field.name] !== existingObject[field.name] &&
    field.type.getInterfaces &&
    field.type.getInterfaces().includes(interfaces.Node)
  );
  const nodes = await* nodeFields.map((field) => {
    const id = newObject[field.name];
    if (!db.isValidID(field.type.name, id)) {
      const reindexID = toReindexID(id);
      throw new GraphQLError(
        `${type.name}.${field.name}: Invalid ID for type ${field.type.name}: ` +
        reindexID
      );
    }
    return db.getByID(field.type.name, id);
  });
  nodeFields.forEach((field, index) => {
    if (!nodes[index]) {
      const reindexID = toReindexID(newObject[field.name]);
      throw new GraphQLError(
        `${type.name}.${field.name}: ${field.type.name} with ID ` +
        `"${reindexID}" does not exist.`
      );
    }
  });
}
