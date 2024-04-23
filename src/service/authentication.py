import jwt
from pyramid.authentication import CallbackAuthenticationPolicy
from pyramid.security import Everyone, Authenticated

class GroupAwareAuthenticationPolicy(CallbackAuthenticationPolicy):
  def __init__(self, secret, *args, **kwargs):
    self.secret = secret
    super().__init__(*args, **kwargs)

  def unauthenticated_userid(self, request):
    token = request.headers.get('Authorization', '').split(None, 1)[-1]
    try:
      claims = jwt.decode(token, self.secret, algorithms=['HS256'])
      request.jwt_claims = claims
      return claims.get('sub')
    except jwt.ExpiredSignatureError:
      request.jwt_claims = {}
      return None

  def effective_principals(self, request):
    principals = [Everyone]
    userid = self.unauthenticated_userid(request)
    if userid:
      principals.append(Authenticated)
      principals.append(f'user:{userid}')
      groups = request.jwt_claims.get('groups', [])
      for group in groups:
        principals.append(f'group:{group}')
    return principals
