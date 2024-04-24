import unittest
from pyramid import testing
from myproject.authentication import GroupAwareAuthenticationPolicy
import jwt

class AuthenticationPolicyTests(unittest.TestCase):
    def setUp(self):
        self.config = testing.setUp()
        self.policy = GroupAwareAuthenticationPolicy('secretkey')

    def tearDown(self):
        testing.tearDown()

    def test_valid_token(self):
        request = testing.DummyRequest()
        request.headers['Authorization'] = 'Bearer validtoken123'

        with unittest.mock.patch('jwt.decode') as mock_decode:
            mock_decode.return_value = {'sub': 'user123', 'groups': ['group1', 'group2']}
            userid = self.policy.unauthenticated_userid(request)
            self.assertEqual(userid, 'user123')
            principals = self.policy.effective_principals(request)
            self.assertIn('group:group1', principals)
            self.assertIn('group:group2', principals)

    def test_expired_token(self):
        request = testing.DummyRequest()
        request.headers['Authorization'] = 'Bearer expiredtoken123'

        with unittest.mock.patch('jwt.decode', side_effect=jwt.ExpiredSignatureError):
            userid = self.policy.unauthenticated_userid(request)
            self.assertIsNone(userid)

# More tests can be added here

if __name__ == '__main__':
    unittest.main()
