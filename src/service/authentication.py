import pytest
from pyramid import testing
from myproject.authentication import GroupAwareAuthenticationPolicy
from jwt import ExpiredSignatureError, DecodeError
import jwt

@pytest.fixture
def request_with_auth_header():
  request = testing.DummyRequest()
  request.headers['Authorization'] = 'Bearer validtoken123'
  return request

@pytest.fixture
def policy():
  return GroupAwareAuthenticationPolicy('secretkey')

def test_valid_token(request_with_auth_header, policy):
  with pytest.mock.patch('jwt.decode') as mock_decode:
    mock_decode.return_value = {'sub': 'user123', 'groups': ['group1', 'group2']}
    userid = policy.unauthenticated_userid(request_with_auth_header)
    assert userid == 'user123'
    principals = policy.effective_principals(request_with_auth_header)
    assert 'group:group1' in principals
    assert 'group:group2' in principals

def test_expired_token(policy):
  request = testing.DummyRequest()
  request.headers['Authorization'] = 'Bearer expiredtoken123'
  with pytest.mock.patch('jwt.decode', side_effect=ExpiredSignatureError):
    userid = policy.unauthenticated_userid(request)
    assert userid is None

def test_malformed_token(policy):
  request = testing.DummyRequest()
  request.headers['Authorization'] = 'Bearer notatoken'
  with pytest.mock.patch('jwt.decode', side_effect=DecodeError):
    userid = policy.unauthenticated_userid(request)
    assert userid is None
    assert not policy.effective_principals(request)  # Only default principal should be present

