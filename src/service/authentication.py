from pyramid.authentication import CallbackAuthenticationPolicy
from pyramid.security import Everyone, Authenticated
import jwt  # PyJWT

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