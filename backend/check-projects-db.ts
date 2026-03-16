import { DataSource } from 'typeorm';
import { DATABASE_ENTITIES } from './src/config/database.config';

async function checkProjectsDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: DATABASE_ENTITIES,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to Railway database...');
    await dataSource.initialize();
    console.log('✅ Connected to Railway database');

    // Check if projects table exists and has data
    const projectRepo = dataSource.getRepository('Project');
    const userRepo = dataSource.getRepository('User');
    
    console.log('\n📊 Database Status:');
    
    try {
      const projectCount = await projectRepo.count();
      console.log(`Projects table: ✅ (${projectCount} records)`);
    } catch (error) {
      console.log('Projects table: ❌', error.message);
    }
    
    try {
      const userCount = await userRepo.count();
      console.log(`Users table: ✅ (${userCount} records)`);
    } catch (error) {
      console.log('Users table: ❌', error.message);
    }
    
    // Try to run a simple query similar to what listProjects does
    console.log('\n🔍 Testing listProjects query...');
    try {
      const testQuery = await projectRepo
        .createQueryBuilder('project')
        .leftJoinAndSelect('project.owner', 'owner')
        .leftJoinAndSelect('project.members', 'members')
        .leftJoinAndSelect('members.user', 'memberUser')
        .leftJoinAndSelect('project.boards', 'boards')
        .where('project.status = :status', { status: 'active' })
        .take(5)
        .getMany();
        
      console.log(`Query test: ✅ (returned ${testQuery.length} projects)`);
      
      if (testQuery.length > 0) {
        console.log('Sample project:', {
          id: testQuery[0].id,
          name: testQuery[0].name,
          status: testQuery[0].status,
          ownerId: testQuery[0].ownerId
        });
      }
    } catch (error) {
      console.log('Query test: ❌', error.message);
      console.log('Full error:', error);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      console.log('🔌 Database connection closed');
    }
  }
}

checkProjectsDatabase().catch(console.error);