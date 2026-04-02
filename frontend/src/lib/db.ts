import mysql from 'mysql2/promise';

// Create a connection pool connecting to XAMPP MySQL database "hex_db"
export const db = mysql.createPool({
    host: 'localhost',
    user: 'root',      // Default XAMPP user
    password: '',      // Default XAMPP password (empty)
    database: 'hex_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
