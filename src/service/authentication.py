import jwt
from jwt.exceptions import ExpiredSignatureError, DecodeError
from pyramid.authentication import CallbackAuthenticationPolicy
from pyramid.security import Everyone, Authenticated

class GroupAwareAuthenticationPolicy(CallbackAuthenticationPolicy):
  def __init__(self, secret, *args, **kwargs):
    self.secret = secret
    super().__init__(*args, **kwargs)

  def unauthenticated_userid(self, request):
    auth_header = request.headers.get('Authorization', '')
    if not auth_header:
      return None

    try:
      scheme, token = auth_header.split(None, 1)
      if scheme.lower() != 'bearer':
        return None  # Ensure you're dealing with a bearer token

      claims = jwt.decode(token, self.secret, algorithms=['HS256'])
      request.jwt_claims = claims
      return claims.get('sub')
    except (ExpiredSignatureError, DecodeError) as e:
      request.jwt_claims = {}
      return None

  def effective_principals(self, request):
    principals = [Everyone]
    userid = self.unauthenticated_userid(request)
    if userid:
      principals.extend([Authenticated, f'user:{userid}'])
      groups = request.jwt_claims.get('groups', [])
      principals.extend(f'group:{group}' for group in groups)
    return principals
