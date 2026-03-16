import { getMetadataArgsStorage } from 'typeorm';
import { Project } from './project.entity';
import { User } from './user.entity';

describe('entity column metadata', () => {
  it('declares explicit db types for nullable string columns used in production', () => {
    const columns = getMetadataArgsStorage().columns;

    const projectDescription = columns.find(
      (column) =>
        column.target === Project && column.propertyName === 'description',
    );
    const userDisplayName = columns.find(
      (column) =>
        column.target === User && column.propertyName === 'displayName',
    );

    expect(projectDescription?.options.type).toBe('text');
    expect(userDisplayName?.options.type).toBe('varchar');
  });
});