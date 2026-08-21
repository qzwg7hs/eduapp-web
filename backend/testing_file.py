# import bcrypt
# new_hash = bcrypt.hashpw(b"Wyldstyle77!", bcrypt.gensalt()).decode()
# print(new_hash)

import bcrypt
stored_hash = "$2b$12$3.xjGCV113RMb4rk7qjJHO7TjmbAVgU2IbVpPaa56Xe8r6AlSMec6"
print(bcrypt.checkpw(b"1234", stored_hash.encode()))
